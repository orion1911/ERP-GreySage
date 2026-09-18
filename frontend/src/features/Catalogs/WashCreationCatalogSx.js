import React from 'react';
import { Box, Card, CardContent, Stack, Button, IconButton, Chip, Typography, Divider } from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Check as CheckIcon, SwapVert as SwapVertIcon, Add as AddIcon } from '@mui/icons-material';
import { OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';
import { motion, AnimatePresence } from 'motion/react';

// Mobile card list for the Wash Creation catalog (mirrors the other catalog Sx files).
function WashCreationCatalogSx({
  creations,
  search,
  loading,
  initialLoading,
  handleToggleActive,
  showSnackbar,
  handleEditCreation,
  onReorder,
  onAdd
}) {
  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <Button variant="outlined" startIcon={<SwapVertIcon />} onClick={onReorder} disabled={loading} size="small">Order</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd} disabled={loading} size="small">Add</Button>
      </Box>
      <AnimatePresence mode="wait">
        <motion.div
          key={initialLoading ? 'loading' : 'data'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {initialLoading ? (
            <OrderCardsLoader type="washCreation" />
          ) : creations.length > 0 ? (
            creations.map((creation, index) => (
              <Card key={creation._id} sx={{ mb: 1 }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body1" fontWeight="bold">{creation.name}</Typography>
                    <Stack direction="row" spacing={0.5}>
                      <IconButton
                        disabled={loading}
                        color={creation.isActive ? 'warning' : 'success'}
                        onClick={() => handleToggleActive(creation._id)}
                        size="small"
                      >
                        {creation.isActive ? <DeleteIcon fontSize="small" /> : <CheckIcon fontSize="small" />}
                      </IconButton>
                      <IconButton disabled={loading} onClick={() => handleEditCreation(creation)} size="small">
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>
                  <Divider sx={{ my: 0.5 }} />
                  <Chip size="small" color={creation.isActive ? 'success' : 'default'} label={creation.isActive ? 'Active' : 'Inactive'} />
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>#{index + 1}</Typography>
                </CardContent>
              </Card>
            ))
          ) : (
            'No records found'
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

export default WashCreationCatalogSx;