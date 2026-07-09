import React, { useRef, useState, useLayoutEffect, useCallback } from 'react';
import { Typography, Tooltip } from '@mui/material';

/**
 * Text that truncates when it runs out of room and reveals the full value in a
 * tooltip — but ONLY when it's actually clipped. No tooltip when everything fits,
 * so we don't nag with a redundant hover on short values.
 *
 *   <EllipsisText text={longDetails} />            // single line + ellipsis
 *   <EllipsisText text={notes} lines={2} />        // clamp to 2 lines
 *
 * Renders a MUI <Typography>, so variant / color / component / sx pass straight
 * through. Overflow is measured against the live layout and re-checked on resize,
 * so it stays correct as columns reflow.
 */
function EllipsisText({ text, lines = 1, variant = 'body2', tooltipProps, sx, ...rest }) {
  const ref = useRef(null);
  const [clipped, setClipped] = useState(false);
  const value = text == null || text === '' ? '' : String(text);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Vertical clamp overflows height; single-line overflows width.
    const over = lines > 1
      ? el.scrollHeight > el.clientHeight + 1
      : el.scrollWidth > el.clientWidth + 1;
    setClipped(over);
  }, [lines]);

  useLayoutEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, value]);

  const clampSx = lines > 1
    ? {
        display: '-webkit-box',
        WebkitLineClamp: lines,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        wordBreak: 'break-word',
      }
    : {
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      };

  const node = (
    <Typography
      ref={ref}
      variant={variant}
      sx={{ ...clampSx, ...sx }}
      {...rest}
    >
      {value || ' '}
    </Typography>
  );

  if (!clipped || !value) return node;

  return (
    <Tooltip title={value} placement="top" enterDelay={300} arrow {...tooltipProps}>
      {node}
    </Tooltip>
  );
}

export default EllipsisText;
