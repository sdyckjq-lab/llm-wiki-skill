import { Check, X } from "lucide-react";
import React from "react";

import type {
	AccentMode,
	AppearancePrefs,
	DensityMode,
	HandMode,
	PaperMode,
	ThemeMode,
	UserBubbleMode,
} from "../lib/appearance";
import { cn } from "../lib/utils";

interface AppearancePanelProps {
	open: boolean;
	value: AppearancePrefs;
	onChange: (patch: Partial<AppearancePrefs>) => void;
	onClose: () => void;
}

const themeOptions: Array<{ value: ThemeMode; label: string }> = [
	{ value: "light", label: "浅纸" },
	{ value: "dark", label: "夜灯" },
];

const paperOptions: Array<{ value: PaperMode; label: string }> = [
	{ value: "clean", label: "纯净" },
	{ value: "grid", label: "网格" },
	{ value: "laid", label: "纹理" },
];

const userBubbleOptions: Array<{ value: UserBubbleMode; label: string }> = [
	{ value: "soft", label: "柔和" },
	{ value: "solid", label: "实色" },
];

const handOptions: Array<{ value: HandMode; label: string }> = [
	{ value: "on", label: "开启" },
	{ value: "off", label: "关闭" },
];

const densityOptions: Array<{ value: DensityMode; label: string }> = [
	{ value: "cozy", label: "舒展" },
	{ value: "compact", label: "紧凑" },
];

const accentOptions: Array<{ value: AccentMode; label: string }> = [
	{ value: "terracotta", label: "陶土" },
	{ value: "clay", label: "黏土" },
	{ value: "amber", label: "琥珀" },
	{ value: "rose", label: "玫瑰" },
];

export function AppearancePanel({ open, value, onChange, onClose }: AppearancePanelProps) {
	if (!open) return null;

	return (
		<React.Fragment>
		<section className="appearance-panel" aria-label="外观偏好">
			<div className="appearance-panel-header">
				<div>
					<h2>外观</h2>
					<p>Paper</p>
				</div>
				<button type="button" className="appearance-close" onClick={onClose} aria-label="关闭外观面板">
					<X />
				</button>
			</div>

			<SegmentedGroup
				label="主题"
				value={value.theme}
				options={themeOptions}
				onChange={(theme) => onChange({ theme })}
			/>
			<SegmentedGroup
				label="纸张"
				value={value.paper}
				options={paperOptions}
				onChange={(paper) => onChange({ paper })}
			/>

			<div className="appearance-group">
				<div className="appearance-label">配色</div>
				<div className="appearance-swatches">
					{accentOptions.map((item) => (
						<button
							key={item.value}
							type="button"
							className={cn(
								"appearance-swatch",
								`appearance-swatch-${item.value}`,
								value.accent === item.value && "appearance-swatch-active",
							)}
							onClick={() => onChange({ accent: item.value })}
							aria-label={`配色：${item.label}`}
							aria-pressed={value.accent === item.value}
						>
							{value.accent === item.value && <Check />}
						</button>
					))}
				</div>
			</div>

			<SegmentedGroup
				label="气泡"
				value={value.userbubble}
				options={userBubbleOptions}
				onChange={(userbubble) => onChange({ userbubble })}
			/>
			<SegmentedGroup
				label="手写"
				value={value.hand}
				options={handOptions}
				onChange={(hand) => onChange({ hand })}
			/>
			<SegmentedGroup
				label="密度"
				value={value.density}
				options={densityOptions}
				onChange={(density) => onChange({ density })}
			/>
		</section>
		</React.Fragment>
	);
}

function SegmentedGroup<Value extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: Value;
	options: Array<{ value: Value; label: string }>;
	onChange: (value: Value) => void;
}) {
	return (
		<div className="appearance-group">
			<div className="appearance-label">{label}</div>
			<div className="appearance-segmented">
				{options.map((item) => (
					<button
						key={item.value}
						type="button"
						className={cn("appearance-segment", value === item.value && "appearance-segment-active")}
						onClick={() => onChange(item.value)}
						aria-pressed={value === item.value}
					>
						{item.label}
					</button>
				))}
			</div>
		</div>
	);
}
