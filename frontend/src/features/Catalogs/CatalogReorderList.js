import React, { useState, useEffect } from 'react';
import { Box, Button, Stack, Typography, Paper } from '@mui/material';
import { DragIndicator } from '@mui/icons-material';
import { Reorder, useDragControls } from 'motion/react';

// Shared drag-to-reorder surface for catalog lookups (clients / vendors).
// Renders the full active list as a vertical draggable list — no pagination,
// column-sort or search — and persists the new sequence via onSave(orderedIds).
// Used by all four catalog pages in place of their table while in "reorder mode".
function CatalogReorderList({ items = [], getPrimary, getSecondary, onSave, onCancel, saving = false }) {
  const [order, setOrder] = useState(items);

  // Re-seed when the upstream list changes (e.g. after a save + refetch).
  useEffect(() => { setOrder(items); }, [items]);

  const handleSave = () => onSave(order.map(it => it._id));

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        spacing={1}
        sx={{ mb: 1.5 }}
      >
        <Typography variant="body2" color="text.secondary">
          Drag rows to set the display order used in dropdowns everywhere.
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>Save Order</Button>
        </Stack>
      </Stack>
      <Reorder.Group
        axis="y"
        values={order}
        onReorder={setOrder}
        style={{ listStyle: 'none', padding: 0, margin: 0 }}
      >
        {order.map((item) => (
          <ReorderRow key={item._id} item={item} getPrimary={getPrimary} getSecondary={getSecondary} />
        ))}
      </Reorder.Group>
    </Box>
  );
}

function ReorderRow({ item, getPrimary, getSecondary }) {
  // dragListener=false + a handle keeps text selectable and avoids accidental drags.
  const controls = useDragControls();
  const secondary = getSecondary ? getSecondary(item) : '';
  return (
    <Reorder.Item value={item} dragListener={false} dragControls={controls} style={{ marginBottom: 8 }}>
      <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', p: 1, gap: 1.5 }}>
        <Box
          onPointerDown={(e) => controls.start(e)}
          sx={{ cursor: 'grab', display: 'flex', alignItems: 'center', color: 'text.secondary', touchAction: 'none' }}
        >
          <DragIndicator />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap>{getPrimary(item)}</Typography>
          {secondary ? (
            <Typography variant="caption" color="text.secondary" noWrap component="div">{secondary}</Typography>
          ) : null}
        </Box>
      </Paper>
    </Reorder.Item>
  );
}

export default CatalogReorderList;
