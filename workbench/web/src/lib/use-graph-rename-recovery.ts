import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphRenameRecoveryData } from "@llm-wiki/workbench-contracts";

interface Options {
	kbPath: string | null;
	getRecovery: (kbPath: string) => Promise<GraphRenameRecoveryData>;
}

interface Snapshot {
	selection: object;
	data: GraphRenameRecoveryData;
}

interface RequestResult {
	selection: object;
	requestId: number;
}

interface RecoveryError {
	selection: object;
	requestId: number;
	message: string;
}

interface DismissedReceipts {
	selection: object;
	operationIds: Set<string>;
}

export function useGraphRenameRecovery({ kbPath, getRecovery }: Options) {
	const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
	const [failure, setFailure] = useState<RecoveryError | null>(null);
	const [dismissed, setDismissed] = useState<DismissedReceipts | null>(null);
	const requestIdRef = useRef(0);
	const selection = useMemo(() => ({ kbPath }), [kbPath]);
	const selectionRef = useRef<object | null>(selection);
	const latestSuccessRef = useRef<RequestResult | null>(null);
	useEffect(() => {
		selectionRef.current = selection;
		return () => {
			if (selectionRef.current === selection) selectionRef.current = null;
		};
	}, [selection]);

	const readRecovery = useCallback(async (
		path: string,
		rejectLatestError = false,
	): Promise<GraphRenameRecoveryData | null> => {
		const requestId = ++requestIdRef.current;
		const requestSelection = selection;
		try {
			const response = getRecovery(path);
			await Promise.resolve();
			const data = await response;
			if (selectionRef.current !== requestSelection) return null;
			const latestSuccess = latestSuccessRef.current;
			if (
				latestSuccess?.selection === requestSelection
				&& latestSuccess.requestId > requestId
			) return null;
			latestSuccessRef.current = { selection: requestSelection, requestId };
			setSnapshot({ selection: requestSelection, data });
			setFailure((currentFailure) => (
				currentFailure?.selection === requestSelection ? null : currentFailure
			));
			return data;
		} catch (cause: unknown) {
			if (selectionRef.current !== requestSelection) return null;
			const latestSuccess = latestSuccessRef.current;
			if (
				latestSuccess?.selection === requestSelection
				&& latestSuccess.requestId > requestId
			) return null;
			const message = cause instanceof Error ? cause.message : "改名恢复状态读取失败";
			setFailure((currentFailure) => {
				if (
					currentFailure?.selection === requestSelection
					&& currentFailure.requestId > requestId
				) return currentFailure;
				return { selection: requestSelection, requestId, message };
			});
			if (rejectLatestError) throw cause;
			return null;
		}
	}, [getRecovery, selection]);

	useEffect(() => {
		if (!kbPath) return;
		void Promise.resolve().then(() => readRecovery(kbPath));
	}, [kbPath, readRecovery]);

	const current = snapshot?.selection === selection ? snapshot.data : null;
	const error = failure?.selection === selection ? failure.message : null;
	const loading = Boolean(kbPath) && current === null && error === null;
	const renameBlocked = Boolean(kbPath) && (error !== null || current === null || current.status !== "clear");
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
