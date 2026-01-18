const maskLine = (line: string) => line.replace(/[^\s]/g, '#');

export const buildPreviewSlices = (content: string) => {
	const lines = content.split('\n');
	const total = lines.length;
	const minLocked = 4;
	let visibleCount = Math.ceil(total / 2);

	if (total - visibleCount < minLocked) {
		visibleCount = Math.max(1, total - minLocked);
	}

	const visible = lines.slice(0, visibleCount).join('\n');
	const lockedLines = lines.slice(visibleCount);
	const masked = lockedLines.map(maskLine).join('\n');
	const locked = masked && visible ? `\n${masked}` : masked;

	return { visible, locked };
};
