import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphRenameRecoveryData } from "@llm-wiki/workbench-contracts";

interface Options {
	kbPath: string | null;
	getRecovery: (kbPath: string) => Promise<GraphRenameRecoveryData>;
}

interface Snapshot {
	kbPath: string;
	data: GraphRenameRecoveryData;
}

interface DismissedReceipts {
	selection: object;
	operationIds: Set<string>;
}

export function useGraphRenameRecovery({ kbPath, getRecovery }: Options) {
	const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [dismissed, setDismissed] = useState<DismissedReceipts | null>(null);
	const requestIdRef = useRef(0);
	const selection = useMemo(() => ({ kbPath }), [kbPath]);

	const readRecovery = useCallback(async (
		path: string,
		rejectLatestError = false,
	): Promise<GraphRenameRecoveryData | null> => {
		const requestId = ++requestIdRef.current;
		try {
			const response = getRecovery(path);
			await Promise.resolve();
			if (requestId === requestIdRef.current) setError(null);
			const data = await response;
			if (requestId !== requestIdRef.current) return null;
			setSnapshot({ kbPath: path, data });
			return data;
		} catch (cause: unknown) {
			if (requestId !== requestIdRef.current) return null;
			setSnapshot(null);
			setError(cause instanceof Error ? cause.message : "改名恢复状态读取失败");
			if (rejectLatestError) throw cause;
			return null;
		}
	}, [getRecovery]);

	useEffect(() => {
		if (!kbPath) {
			requestIdRef.current += 1;
			return;
		}
		void Promise.resolve().then(() => readRecovery(kbPath));
		return () => {
			requestIdRef.current += 1;
		};
	}, [kbPath, readRecovery]);

	const current = snapshot?.kbPath === kbPath ? snapshot.data : null;
	const loading = Boolean(kbPath) && snapshot?.kbPath !== kbPath && error === null;
	const renameBlocked = Boolean(kbPath) && (current === null || current.status !== "clear");
	const visibleReceipts = useMemo(() => {
		if (!current) return [];
		const hidden = dismissed?.selection === selection ? dismissed.operationIds : new Set<string>();
		return current.retained_evidence_receipts.filter((receipt) => !hidden.has(receipt.operation_id));
	}, [current, dismissed, selection]);

	const dismissReceipt = useCallback((operationId: string) => {
		if (!kbPath) return;
		setDismissed((currentDismissed) => {
			const operationIds = currentDismissed?.selection === selection
				? new Set(currentDismissed.operationIds)
				: new Set<string>();
			operationIds.add(operationId);
			return { selection, operationIds };
		});
	}, [kbPath, selection]);

	const recheck = useCallback(async () => {
		if (!kbPath) return null;
		return readRecovery(kbPath);
	}, [kbPath, readRecovery]);
	const refreshAfterMutation = useCallback(async () => {
		if (!kbPath) return null;
		return readRecovery(kbPath, true);
	}, [kbPath, readRecovery]);

	return {
		status: current,
		loading,
		error,
		renameBlocked,
		visibleReceipts,
		dismissReceipt,
		refreshAfterMutation,
		recheck,
	};
}
