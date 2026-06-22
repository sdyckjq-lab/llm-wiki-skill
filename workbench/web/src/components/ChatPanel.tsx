import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Files, Send, Square, X } from "lucide-react";

import { CommandMenu } from "./CommandMenu";
import { ExportButtons } from "./ExportButtons";
import { MarkdownView } from "./MarkdownView";
import { RefMenu } from "./RefMenu";
import { ToolHistorySummary } from "./ToolHistorySummary";
import { ToolStatusRunway } from "./ToolStatusRunway";
import {
	buildExportPrompt,
	type CommandItem,
	type ExportKind,
	inspectKnowledgeBasePath,
	type InspectPathResult,
	listCommands,
	listRefs,
	type PageRef,
	streamPrompt,
	type ToolStatusContractEvent,
	type UIMessage,
} from "../lib/api";
import { createLegacyToolStatusState } from "../lib/legacy-tool-status";
import {
	cancelActiveToolStatus,
	createToolStatusState,
	flushToolStatusUpdates,
	reduceToolStatusEvent,
	type ToolStatusState,
} from "../lib/tool-status-model";
import { cn } from "../lib/utils";
import { DEFAULT_CHAT_STATUS, type ChatStatusSnapshot } from "../lib/view-status";
import { extractWikiPageRefs } from "../lib/wiki-links";

type ToolMark = { name: string; status: "running" | "done" };

const CHAT_BOTTOM_THRESHOLD_PX = 100;

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	tools: ToolMark[];
	toolStatus?: ToolStatusState;
}

function newId() {
	return Math.random().toString(36).slice(2, 10);
}

function fromUIMessage(m: UIMessage): Message {
	const tools = m.tools.map((t) => ({ name: t.name, status: "done" as const }));
	return {
		id: m.id,
		role: m.role,
		content: m.content,
		tools,
		toolStatus: m.role === "assistant" ? createLegacyToolStatusState(m.id, tools) : undefined,
	};
}

function isExportCommand(name: string): name is ExportKind {
	return ["pdf", "docx", "pptx", "xlsx", "html"].includes(name);
}

/**
 * 多轮对话主区。
 *
 * 阶段一 step 8 + review 修：
 *   - 接受 initialMessages（历史消息）作为初始状态
 *   - 父组件通过 key 在切换会话时强制重挂载本组件
 *   - 全局库/模型/主题入口已上提到 TopBar
 *   - 删除"等待 agent 响应…"文字，改用 ▍ 光标
 */
interface Props {
	currentKnowledgeBaseName: string | null;
	currentKnowledgeBasePath: string | null;
	initialMessages: UIMessage[];
	onMessageSent?: () => void;
	onStatusChange?: (snapshot: ChatStatusSnapshot) => void;
	onOpenPage?: (path: string) => void;
	onWikiLinkSeen?: (path: string) => void;
	onArtifactCreated?: (id: string) => void;
	artifactCount?: number;
	onOpenArtifacts?: () => void;
	onStartBatchDigest?: (input: {
		kbPath: string;
		filePaths: string[];
		sourceScanId?: string;
		concurrency: 1 | 3 | 5;
	}) => void;
	pendingPrompt?: {
		id: string;
		message: string;
		displayText: string;
	} | null;
	onPendingPromptConsumed?: () => void;
	pendingInsertRef?: {
		id: string;
		path: string;
	} | null;
	onPendingInsertRefConsumed?: () => void;
}

export function ChatPanel({
	currentKnowledgeBaseName,
	currentKnowledgeBasePath,
	initialMessages,
	onMessageSent,
	onStatusChange,
	onOpenPage,
	onWikiLinkSeen,
	onArtifactCreated,
	artifactCount = 0,
	onOpenArtifacts,
	onStartBatchDigest,
	pendingPrompt,
	onPendingPromptConsumed,
	pendingInsertRef,
	onPendingInsertRefConsumed,
}: Props) {
	const [messages, setMessages] = useState<Message[]>(() => initialMessages.map(fromUIMessage));
	const [input, setInput] = useState("");
	const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [ingestDismissedFor, setIngestDismissedFor] = useState<string | null>(null);
	const [detectedBatch, setDetectedBatch] = useState<{
		path: string;
		inspect: InspectPathResult;
	} | null>(null);
	const [commands, setCommands] = useState<CommandItem[]>([]);
	const [commandMenu, setCommandMenu] = useState<{ open: boolean; query: string; start: number; selected: number }>({
		open: false,
		query: "",
		start: 0,
		selected: 0,
	});
	const [refMenu, setRefMenu] = useState<{ open: boolean; query: string; start: number; selected: number }>({
		open: false,
		query: "",
		start: 0,
		selected: 0,
	});
	const [refs, setRefs] = useState<PageRef[]>([]);
	const [showScrollToBottom, setShowScrollToBottom] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const activeAssistantIdRef = useRef<string | null>(null);
	const toolFlushTimersRef = useRef<Record<string, number>>({});
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const consumedPendingPromptRef = useRef<string | null>(null);
	const consumedPendingInsertRef = useRef<string | null>(null);
	const sendPromptRef = useRef<(overrideText?: string, displayText?: string) => void>(() => {});
	const messagesRef = useRef<HTMLDivElement | null>(null);
	const followBottomRef = useRef(true);

	const detectedMaterial = (() => {
		const text = input.trim();
		if (/^https?:\/\/\S+$/.test(text)) return { kind: "URL", value: text };
		if (/^(\/|~\/)\S+$/.test(text)) return { kind: "路径", value: text };
		return null;
	})();
	const ingestChipVisible = Boolean(
		detectedMaterial && ingestDismissedFor !== detectedMaterial.value,
	);
	const batchChipVisible = Boolean(
		detectedBatch?.inspect.ingestibleFiles?.count && currentKnowledgeBasePath,
	);

	useEffect(() => {
		const reload = () => {
			listCommands()
				.then(setCommands)
				.catch(() => setCommands([]));
		};
		reload();
		window.addEventListener("llm-wiki-agent:commands-changed", reload);
		return () => window.removeEventListener("llm-wiki-agent:commands-changed", reload);
	}, [currentKnowledgeBaseName]);

	useEffect(() => {
		const toolFlushTimers = toolFlushTimersRef.current;
		return () => {
			abortRef.current?.abort();
			for (const timer of Object.values(toolFlushTimers)) window.clearTimeout(timer);
			onStatusChange?.(DEFAULT_CHAT_STATUS);
		};
	}, [onStatusChange]);

	useEffect(() => {
		onStatusChange?.({
			status,
			summary: chatStatusSummary(status, errorMsg, Boolean(currentKnowledgeBaseName)),
		});
	}, [currentKnowledgeBaseName, errorMsg, onStatusChange, status]);

	const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
		const element = messagesRef.current;
		if (!element) return;
		if (typeof element.scrollTo === "function") {
			element.scrollTo({ top: element.scrollHeight, behavior });
		} else {
			element.scrollTop = element.scrollHeight;
		}
	}, []);

	const isMessagesNearBottom = useCallback(() => {
		const element = messagesRef.current;
		if (!element) return true;
		const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
		return distance <= CHAT_BOTTOM_THRESHOLD_PX;
	}, []);

	const handleMessagesScroll = useCallback(() => {
		const nearBottom = isMessagesNearBottom();
		followBottomRef.current = nearBottom;
		setShowScrollToBottom(messages.length > 0 && !nearBottom);
	}, [isMessagesNearBottom, messages.length]);

	const restoreAutoFollow = useCallback(() => {
		followBottomRef.current = true;
		setShowScrollToBottom(false);
		scrollMessagesToBottom("smooth");
	}, [scrollMessagesToBottom]);

	useLayoutEffect(() => {
		if (messages.length === 0) {
			followBottomRef.current = true;
			return;
		}
		if (followBottomRef.current) {
			scrollMessagesToBottom("auto");
		}
	}, [messages, scrollMessagesToBottom]);

	useEffect(() => {
		if (!refMenu.open || !currentKnowledgeBasePath) {
			const timer = window.setTimeout(() => setRefs([]), 0);
			return () => window.clearTimeout(timer);
		}
		let cancelled = false;
		const timer = window.setTimeout(() => {
			listRefs(currentKnowledgeBasePath, refMenu.query)
				.then((items) => {
					if (!cancelled) setRefs(items);
				})
				.catch(() => {
					if (!cancelled) setRefs([]);
				});
		}, 120);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [currentKnowledgeBasePath, refMenu.open, refMenu.query]);

	const updateMenus = (value: string, cursor: number) => {
		const before = value.slice(0, cursor);
		const commandMatch = before.match(/(^|\s)\/(\S*)$/);
		if (commandMatch) {
			const query = commandMatch[2] ?? "";
			setCommandMenu({ open: true, query, start: cursor - query.length - 1, selected: 0 });
			setRefMenu((prev) => ({ ...prev, open: false }));
			return;
		}
		const refMatch = before.match(/(^|\s)@(\S*)$/);
		if (refMatch && currentKnowledgeBasePath) {
			const query = refMatch[2] ?? "";
			setRefMenu({ open: true, query, start: cursor - query.length - 1, selected: 0 });
			setCommandMenu((prev) => ({ ...prev, open: false }));
			return;
		}
		setCommandMenu((prev) => ({ ...prev, open: false }));
		setRefMenu((prev) => ({ ...prev, open: false }));
	};

	const visibleCommands = (() => {
		const normalized = commandMenu.query.toLowerCase();
		const filtered = commands.filter((item) => {
			if (!normalized) return true;
			return (
				item.slug.toLowerCase().includes(normalized) ||
				item.name.toLowerCase().includes(normalized) ||
				item.description.toLowerCase().includes(normalized)
			);
		});
		return [
			...filtered.filter((item) => item.source === "builtin" && !item.skillPath),
			...filtered.filter((item) => item.source === "builtin" && item.skillPath),
			...filtered.filter((item) => item.source === "pi-default"),
			...filtered.filter((item) => item.source === "user-global"),
		];
	})();

	const replaceCommandToken = (item: CommandItem) => {
		if (isExportCommand(item.name)) {
			setCommandMenu((prev) => ({ ...prev, open: false }));
			startExport(item.name);
			return;
		}
		const textarea = textareaRef.current;
		const cursor = textarea?.selectionStart ?? input.length;
		const next = `${input.slice(0, commandMenu.start)}${item.slug} ${input.slice(cursor)}`;
		const nextCursor = commandMenu.start + item.slug.length + 1;
		setInput(next);
		setCommandMenu((prev) => ({ ...prev, open: false }));
		requestAnimationFrame(() => {
			textareaRef.current?.focus();
			textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
		});
	};

	const replaceRefToken = (item: PageRef) => {
		const textarea = textareaRef.current;
		const cursor = textarea?.selectionStart ?? input.length;
		const link = `[[${item.path}]]`;
		const next = `${input.slice(0, refMenu.start)}${link} ${input.slice(cursor)}`;
		const nextCursor = refMenu.start + link.length + 1;
		setInput(next);
		setRefMenu((prev) => ({ ...prev, open: false }));
		requestAnimationFrame(() => {
			textareaRef.current?.focus();
			textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
		});
	};

	const exportTitleSource = () =>
		messages.find((message) => message.role === "user")?.content ?? input;

	const exportDisplayText = (kind: ExportKind) => {
		const labels: Record<ExportKind, string> = {
			pdf: "PDF",
			docx: "Word 文档",
			pptx: "PPT 演示文稿",
			xlsx: "Excel 表格",
			html: "HTML 页面",
		};
		return `导出为 ${labels[kind]}`;
	};

	const slashExportKind = (text: string): ExportKind | null => {
		const match = text.trim().match(/^\/(pdf|docx|pptx|xlsx|html)$/);
		return match && isExportCommand(match[1]) ? match[1] : null;
	};

	const startExport = (kind: ExportKind) => {
		void sendPrompt(buildExportPrompt(kind, exportTitleSource()), exportDisplayText(kind));
	};

	const handleExport = (kind: ExportKind) => {
		startExport(kind);
	};

	const scheduleToolStatusFlush = (assistantId: string, delayMs: number) => {
		const existingTimer = toolFlushTimersRef.current[assistantId];
		if (existingTimer) window.clearTimeout(existingTimer);
		toolFlushTimersRef.current[assistantId] = window.setTimeout(() => {
			delete toolFlushTimersRef.current[assistantId];
			setMessages((prev) =>
				prev.map((message) => {
					if (message.id !== assistantId || !message.toolStatus) return message;
					return { ...message, toolStatus: flushToolStatusUpdates(message.toolStatus, Date.now()) };
				}),
			);
		}, Math.max(0, delayMs));
	};

	const applyToolStatusEvent = (assistantId: string, payload: ToolStatusContractEvent) => {
		const nowMs = Date.now();
		let flushDelay: number | null = null;
		setMessages((prev) =>
			prev.map((message) => {
				if (message.id !== assistantId) return message;
				const currentState =
					message.toolStatus ?? createToolStatusState(payload.runId, payload.messageId);
				const nextState = reduceToolStatusEvent(currentState, payload, { nowMs });
				if (nextState.pendingUpdateCount > 0 && Number.isFinite(nextState.nextUpdateFlushAt)) {
					flushDelay = nextState.nextUpdateFlushAt - nowMs;
				}
				return { ...message, tools: [], toolStatus: nextState };
			}),
		);
		if (flushDelay !== null) scheduleToolStatusFlush(assistantId, flushDelay);
	};

	const cancelCurrentToolStatus = (assistantId: string, reason = "已停止") => {
		setMessages((prev) =>
			prev.map((message) => {
				if (message.id !== assistantId || !message.toolStatus) return message;
				return { ...message, tools: [], toolStatus: cancelActiveToolStatus(message.toolStatus, reason) };
			}),
		);
	};

	const stopStreaming = () => {
		const assistantId = activeAssistantIdRef.current;
		if (assistantId) cancelCurrentToolStatus(assistantId, "用户已停止");
		abortRef.current?.abort();
		setStatus("idle");
	};

	const sendPrompt = async (overrideText?: string, displayText?: string) => {
		const text = (overrideText ?? input).trim();
		if (!text || status === "streaming") return;
		if (!overrideText) {
			const exportKind = slashExportKind(text);
			if (exportKind) {
				setCommandMenu((prev) => ({ ...prev, open: false }));
				startExport(exportKind);
				return;
			}
		}
		const outgoingText =
			!overrideText && ingestChipVisible && detectedMaterial
				? `请调用 llm-wiki Skill 把以下素材消化到当前知识库的 raw/，完成后回到对话告诉我落地路径：\n${detectedMaterial.value}`
				: text;
		const visibleText = displayText ?? text;

		setErrorMsg(null);
		setInput("");
		setIngestDismissedFor(null);
		const userMsg: Message = { id: newId(), role: "user", content: visibleText, tools: [] };
		const assistantId = newId();
		const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", tools: [] };
		followBottomRef.current = true;
		setShowScrollToBottom(false);
		setMessages((prev) => [...prev, userMsg, assistantMsg]);
		setStatus("streaming");
		activeAssistantIdRef.current = assistantId;

		const controller = new AbortController();
		abortRef.current = controller;

		try {
			const stream = await streamPrompt(outgoingText, controller.signal);
			for await (const { event, data } of stream) {
				if (event === "assistant_text_delta") {
					const payload = parseToolStatusEvent(event, data);
					if (payload?.type === "assistant_text_delta") {
						setMessages((prev) =>
							prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + payload.delta } : m)),
						);
					}
				} else if (isToolStatusEventName(event)) {
					const payload = parseToolStatusEvent(event, data);
					if (!payload) continue;
					applyToolStatusEvent(assistantId, payload);
					if (payload.type === "assistant_done") {
						setStatus("idle");
						onMessageSent?.();
					} else if (payload.type === "assistant_cancelled") {
						setStatus("idle");
					} else if (payload.type === "assistant_error") {
						setErrorMsg(payload.error);
						setStatus("error");
					}
				} else if (event === "text_delta") {
					setMessages((prev) =>
						prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + data } : m)),
					);
				} else if (event === "knowledge_search_start") {
					continue;
				} else if (event === "knowledge_search_done" || event === "knowledge_search_empty") {
					continue;
				} else if (event === "knowledge_search_error") {
					continue;
				} else if (event === "tool_start") {
					continue;
				} else if (event === "tool_end") {
					continue;
				} else if (event === "done") {
					setStatus("idle");
					onMessageSent?.();
				} else if (event === "artifact_created") {
					const payload = JSON.parse(data) as { id: string };
					onArtifactCreated?.(payload.id);
				} else if (event === "error") {
					const payload = JSON.parse(data) as { message: string; hint?: string };
					setErrorMsg(payload.message + (payload.hint ? `\n提示：${payload.hint}` : ""));
					setStatus("error");
				}
			}
		} catch (err) {
			if ((err as Error).name === "AbortError") {
				setStatus("idle");
				return;
			}
			const message = err instanceof Error ? err.message : String(err);
			setErrorMsg(message.includes("409") ? "当前对话还在生成中，请停止或稍后再试。" : message);
			setStatus("error");
		} finally {
			abortRef.current = null;
			if (activeAssistantIdRef.current === assistantId) activeAssistantIdRef.current = null;
		}
	};
	useEffect(() => {
		sendPromptRef.current = (overrideText?: string, displayText?: string) => {
			void sendPrompt(overrideText, displayText);
		};
	});

	useEffect(() => {
		if (!pendingPrompt || consumedPendingPromptRef.current === pendingPrompt.id) return;
		consumedPendingPromptRef.current = pendingPrompt.id;
		onPendingPromptConsumed?.();
		sendPromptRef.current(pendingPrompt.message, pendingPrompt.displayText);
	}, [onPendingPromptConsumed, pendingPrompt]);

	useEffect(() => {
		if (!pendingInsertRef || consumedPendingInsertRef.current === pendingInsertRef.id) return;
		consumedPendingInsertRef.current = pendingInsertRef.id;
		const link = `[[${pendingInsertRef.path}]]`;
		setInput((current) => `${current}${current.trim() ? " " : ""}${link} `);
		onPendingInsertRefConsumed?.();
		requestAnimationFrame(() => textareaRef.current?.focus());
	}, [onPendingInsertRefConsumed, pendingInsertRef]);

	useEffect(() => {
		if (!onWikiLinkSeen) return;
		for (const message of messages) {
			if (message.role !== "assistant") continue;
			for (const path of extractWikiPageRefs(message.content)) onWikiLinkSeen(path);
		}
	}, [messages, onWikiLinkSeen]);

	const startDetectedBatchDigest = () => {
		if (!currentKnowledgeBasePath || !detectedBatch?.inspect.ingestibleFiles?.paths.length) return;
		onStartBatchDigest?.({
			kbPath: currentKnowledgeBasePath,
			filePaths: detectedBatch.inspect.ingestibleFiles.paths,
			sourceScanId: detectedBatch.inspect.ingestibleFiles.scanId,
			concurrency: 3,
		});
		setDetectedBatch(null);
	};

	const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		const droppedPath = parseDroppedPath(event.dataTransfer);
		if (!droppedPath) {
			setErrorMsg("这次拖拽没有暴露真实路径，请直接粘贴路径");
			return;
		}
		inspectKnowledgeBasePath(droppedPath)
			.then((result) => {
				if (result.isDirectory && result.ingestibleFiles?.count) {
					setDetectedBatch({ path: droppedPath, inspect: result });
					setInput(droppedPath);
				} else {
					setInput(droppedPath);
				}
			})
			.catch((err) => setErrorMsg(err instanceof Error ? err.message : String(err)));
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Escape" && (commandMenu.open || refMenu.open)) {
			e.preventDefault();
			setCommandMenu((prev) => ({ ...prev, open: false }));
			setRefMenu((prev) => ({ ...prev, open: false }));
			return;
		}
		if (commandMenu.open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
			e.preventDefault();
			const max = Math.max(visibleCommands.length - 1, 0);
			setCommandMenu((prev) => ({
				...prev,
				selected:
					e.key === "ArrowDown"
						? prev.selected >= max
							? 0
							: prev.selected + 1
						: prev.selected <= 0
							? max
							: prev.selected - 1,
			}));
			return;
		}
		if (refMenu.open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
			e.preventDefault();
			const max = Math.max(refs.length - 1, 0);
			setRefMenu((prev) => ({
				...prev,
				selected:
					e.key === "ArrowDown"
						? prev.selected >= max
							? 0
							: prev.selected + 1
						: prev.selected <= 0
							? max
							: prev.selected - 1,
			}));
			return;
		}
		if (commandMenu.open && e.key === "Enter" && visibleCommands[commandMenu.selected]) {
			e.preventDefault();
			replaceCommandToken(visibleCommands[commandMenu.selected]);
			return;
		}
		if (refMenu.open && e.key === "Enter" && refs[refMenu.selected]) {
			e.preventDefault();
			replaceRefToken(refs[refMenu.selected]);
			return;
		}
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			sendPrompt();
		}
	};

	const lastAssistantId = messages
		.slice()
		.reverse()
		.find((m) => m.role === "assistant")?.id;
	const showCursorOn = status === "streaming" ? lastAssistantId : null;

	return (
		<div className="chat-screen">
			<div className="chat-messages" ref={messagesRef} onScroll={handleMessagesScroll}>
				{messages.length === 0 && (
					<div className="chat-empty">
						<div className="chat-empty-title">
							{currentKnowledgeBaseName ? "开始和当前知识库对话" : "左侧选一个知识库进入对话"}
						</div>
						<div className="chat-empty-hint">
							{currentKnowledgeBaseName ? (
								<>可以用 <code>@</code> 引用页面，或用 <code>/</code> 调用命令。</>
							) : (
								<>选择知识库后，agent 会基于该库内容回答。</>
							)}
						</div>
					</div>
				)}
				{messages.map((m) => (
					<MessageBubble
						key={m.id}
						message={m}
						showCursor={m.id === showCursorOn}
						onOpenPage={onOpenPage}
						onWikiLinkSeen={onWikiLinkSeen}
					/>
				))}
			</div>

			{errorMsg && (
				<div className="mx-4 my-2 whitespace-pre-wrap rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
					{errorMsg}
				</div>
			)}

			<div
				className="chat-input-area"
				onDragOver={(event) => event.preventDefault()}
				onDrop={handleDrop}
			>
				{showScrollToBottom && (
					<div className="chat-scroll-bottom">
						<button
							type="button"
							className="chat-scroll-bottom-btn"
							aria-label="回到底部"
							title="回到底部"
							onClick={restoreAutoFollow}
						>
							<ArrowDown className="size-4" aria-hidden="true" />
						</button>
					</div>
				)}
				{artifactCount > 0 && (
					<div className="chat-input-hints">
						<button
							type="button"
							onClick={onOpenArtifacts}
							className="chat-input-artifact"
							title="查看产物"
						>
							<Files className="size-3.5" />
							产物 {artifactCount}
						</button>
					</div>
				)}
				{batchChipVisible && detectedBatch?.inspect.ingestibleFiles && (
					<div className="input-chip">
						<button
							type="button"
							onClick={startDetectedBatchDigest}
							className="truncate text-left hover:text-foreground"
						>
							发现 {detectedBatch.inspect.ingestibleFiles.count} 个可消化文件，点击批量消化
						</button>
						<button
							type="button"
							onClick={() => setDetectedBatch(null)}
							className="rounded-sm p-0.5 hover:bg-accent hover:text-accent-foreground"
							aria-label="关闭批量消化提示"
						>
							<X className="size-3.5" />
						</button>
					</div>
				)}
				{ingestChipVisible && detectedMaterial && (
					<div className="input-chip">
						<span className="truncate">检测到{detectedMaterial.kind}，发送时将作为消化素材</span>
						<button
							type="button"
							onClick={() => setIngestDismissedFor(detectedMaterial.value)}
							className="rounded-sm p-0.5 hover:bg-accent hover:text-accent-foreground"
							aria-label="关闭消化提示"
						>
							<X className="size-3.5" />
						</button>
					</div>
				)}
				<div className="composer-card">
					<CommandMenu
						open={commandMenu.open}
						query={commandMenu.query}
						items={visibleCommands}
						selectedIndex={commandMenu.selected}
						onSelect={replaceCommandToken}
					/>
					<RefMenu
						open={refMenu.open}
						query={refMenu.query}
						items={refs}
						selectedIndex={refMenu.selected}
						onSelect={replaceRefToken}
					/>
					<textarea
						ref={textareaRef}
						value={input}
						onChange={(e) => {
							setInput(e.target.value);
							if (e.target.value.trim() !== ingestDismissedFor) setIngestDismissedFor(null);
							updateMenus(e.target.value, e.target.selectionStart);
						}}
						onClick={(e) => updateMenus(e.currentTarget.value, e.currentTarget.selectionStart)}
						onKeyUp={(e) => {
							if (["Escape", "ArrowDown", "ArrowUp", "Enter"].includes(e.key)) return;
							updateMenus(e.currentTarget.value, e.currentTarget.selectionStart);
						}}
						onKeyDown={handleKeyDown}
						rows={1}
						className="chat-textarea"
						placeholder={
							currentKnowledgeBaseName
								? "写下想法…  @ 引用  / 命令  ·  ⌘↵ 发送"
								: "请先在左侧选择一个知识库…"
						}
						disabled={status === "streaming" || !currentKnowledgeBaseName}
					/>
					<div className="composer-actions">
						{(status === "streaming" || status === "error" || detectedMaterial || detectedBatch) && (
							<span className="composer-status" role={status === "error" ? "alert" : "status"}>
								{status === "streaming" ? "生成中" : status === "error" ? "出错" : "待消化"}
							</span>
						)}
						<button
							type="button"
							className={cn("send-btn", status === "streaming" && "stop-btn")}
							onClick={() => {
								if (status === "streaming") stopStreaming();
								else void sendPrompt();
							}}
							disabled={status !== "streaming" && (!input.trim() || !currentKnowledgeBaseName)}
							title={status === "streaming" ? "停止" : "发送（⌘↵）"}
						>
							{status === "streaming" ? <Square className="size-4" /> : <Send className="size-4" />}
							<span className="sr-only">{status === "streaming" ? "停止" : "发送"}</span>
						</button>
					</div>
				</div>
				{messages.length > 0 && (
					<div className="composer-tools">
						<ExportButtons
							disabled={!currentKnowledgeBaseName || status === "streaming"}
							disabledReason={
								!currentKnowledgeBaseName
									? "请先选择知识库"
									: status === "streaming"
										? "当前正在生成"
										: ""
							}
							onExport={handleExport}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

function MessageBubble({
	message,
	showCursor,
	onOpenPage,
	onWikiLinkSeen,
}: {
	message: Message;
	showCursor: boolean;
	onOpenPage?: (path: string) => void;
	onWikiLinkSeen?: (path: string) => void;
}) {
	const isUser = message.role === "user";
	const showToolRunway = Boolean(
		message.toolStatus && (showCursor || message.toolStatus.cancelReason || message.toolStatus.error),
	);
	return (
		<div className={cn("msg-row", isUser ? "msg-row-user" : "msg-row-assistant")} aria-label={isUser ? "用户消息" : "助手消息"}>
			<div className={cn("msg-avatar", isUser ? "msg-avatar-user" : "msg-avatar-assistant")}>
				{isUser ? "你" : "AI"}
			</div>
			<div className="msg-body">
				<div className="msg-role">{isUser ? "你" : "llm-wiki"}</div>
				{message.toolStatus ? (
					showToolRunway ? (
						<ToolStatusRunway state={message.toolStatus} />
					) : (
						<ToolHistorySummary state={message.toolStatus} />
					)
				) : null}
				<div className="msg-content" aria-label={isUser ? "用户气泡" : "助手气泡"}>
					{isUser ? (
						<span className="whitespace-pre-wrap">{message.content}</span>
					) : (
						<MarkdownView content={message.content} onOpenPage={onOpenPage} onWikiLinkSeen={onWikiLinkSeen} />
					)}
					{showCursor && <span className="animate-cursor-blink ml-0.5">▍</span>}
				</div>
			</div>
		</div>
	);
}

const TOOL_STATUS_EVENT_NAMES: Set<ToolStatusContractEvent["type"]> = new Set([
	"tool_status_start",
	"tool_status_update",
	"tool_status_end",
	"tool_status_summary",
	"assistant_done",
	"assistant_cancelled",
	"assistant_error",
]);

function isToolStatusEventName(event: string): event is ToolStatusContractEvent["type"] {
	return TOOL_STATUS_EVENT_NAMES.has(event as ToolStatusContractEvent["type"]);
}

function parseToolStatusEvent(event: string, data: string): ToolStatusContractEvent | null {
	try {
		const payload = JSON.parse(data) as ToolStatusContractEvent;
		return payload.type === event ? payload : null;
	} catch {
		return null;
	}
}

function chatStatusSummary(
	status: ChatStatusSnapshot["status"],
	errorMsg: string | null,
	hasKnowledgeBase: boolean,
): string {
	if (!hasKnowledgeBase) return "等待选择知识库";
	if (status === "streaming") return "正在接收回复";
	if (status === "error") return errorMsg ?? "对话暂时不可用";
	return "可以发送消息";
}

function parseDroppedPath(dataTransfer: DataTransfer): string | null {
	for (const type of ["text/uri-list", "text/plain"]) {
		const raw = dataTransfer.getData(type).trim();
		if (!raw) continue;
		const first = raw
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line && !line.startsWith("#"));
		if (!first) continue;
		if (first.startsWith("file://")) return decodeURIComponent(new URL(first).pathname);
		if (first.startsWith("/") || first.startsWith("~/")) return first;
	}
	return null;
}
