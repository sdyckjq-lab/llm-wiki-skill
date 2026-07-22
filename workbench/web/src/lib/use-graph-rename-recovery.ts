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
	kbPath: string;
	operationIds: Set<string>;
}

export function useGraphRenameRecovery({ kbPath, getRecovery }: Options) {
	const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [dismissed, setDismissed] = useState<DismissedReceipts | null>(null);
	const requestIdRef = useRef(0);

	const readRecovery = useCallback(async (path: string): Promise<void> => {
		const requestId = ++requestIdRef.current;
		await Promise.resolve();
		if (requestId === requestIdRef.current) setError(null);
		try {
			const data = await getRecovery(path);
			if (requestId !== requestIdRef.current) return;
			setSnapshot({ kbPath: path, data });
			setDismissed({ kbPath: path, operationIds: new Set() });
		} catch (cause) {
			if (requestId !== requestIdRef.current) return;
			setSnapshot(null);
			setError(cause instanceof Error ? cause.message : "改名恢复状态读取失败");
		}
	}, [getRecovery]);

	useEffect(() => {
		if (!kbPath) {
			requestIdRef.current += 1;
			return;
		}
		const requestId = ++requestIdRef.current;
		void Promise.resolve()
			.then(() => {
				if (requestId === requestIdRef.current) setError(null);
				return getRecovery(kbPath);
			})
			.then((data) => {
				if (requestId !== requestIdRef.current) return;
				setSnapshot({ kbPath, data });
				setDismissed({ kbPath, operationIds: new Set() });
			})
			.catch((cause: unknown) => {
				if (requestId !== requestIdRef.current) return;
				setSnapshot(null);
				setError(cause instanceof Error ? cause.message : "改名恢复状态读取失败");
			});
		return () => {
			requestIdRef.current += 1;
		};
	}, [getRecovery, kbPath]);

	const current = snapshot?.kbPath === kbPath ? snapshot.data : null;
	const loading = Boolean(kbPath) && snapshot?.kbPath !== kbPath && error === null;
	const renameBlocked = Boolean(kbPath) && (current === null || current.status !== "clear");
	const visibleReceipts = useMemo(() => {
		if (!current) return [];
		const hidden = dismissed?.kbPath === kbPath ? dismissed.operationIds : new Set<string>();
		return current.retained_evidence_receipts.filter((receipt) => !hidden.has(receipt.operation_id));
	}, [current, dismissed, kbPath]);

	const dismissReceipt = useCallback((operationId: string) => {
		if (!kbPath) return;
		setDismissed((currentDismissed) => {
			const operationIds = currentDismissed?.kbPath === kbPath
				? new Set(currentDismissed.operationIds)
				: new Set<string>();
			operationIds.add(operationId);
			return { kbPath, operationIds };
		});
	}, [kbPath]);

	const acceptRecovery = useCallback((data: GraphRenameRecoveryData) => {
		if (!kbPath) return;
		setSnapshot({ kbPath, data });
		setError(null);
	}, [kbPath]);

	const recheck = useCallback(async () => {
		if (!kbPath) return;
		await readRecovery(kbPath);
	}, [kbPath, readRecovery]);

	return {
		status: current,
		loading,
		error,
		renameBlocked,
		visibleReceipts,
		dismissReceipt,
		acceptRecovery,
		recheck,
	};
}
