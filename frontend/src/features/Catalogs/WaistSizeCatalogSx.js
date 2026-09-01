import React from 'react';
import { Box, Card, CardContent, Stack, Button, IconButton, Typography, Grid, Tooltip, Switch, FormControlLabel } from '@mui/material';
import { Delete as DeleteIcon, Check as CheckIcon } from '@mui/icons-material';
import { OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';
import { motion, AnimatePresence } from 'motion/react';

function WaistSizeCatalogSx({ sizes, loading, handleToggleDefault, handleToggleActive, onAdd }) {
  return (
    <Box sx={{ pt: 1 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, justifyContent: 'flex-end', alignItems: 'center' }}>
        <Button size="small" variant="contained" onClick={onAdd} disabled={loading}>Add</Button>
      </Box>
      <AnimatePresence mode="wait">
        <motion.div
          key={!sizes ? 'loading' : 'data'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {!sizes ? (
            <OrderCardsLoader type="vendor" />
          ) : sizes.length > 0 ? (
            sizes.map((ws) => (
              <Card key={ws._id} variant="outlined" sx={{ mb: 1.5, boxShadow: 1 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Grid container spacing={1} alignItems="center">
                    <Grid size={{ xs: 3 }} sx={{ textAlign: 'left' }}>
                      <Typography variant="h6" fontWeight="bold">{ws.size}</Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }} sx={{ textAlign: 'left' }}>
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={!!ws.isDefault}
                            disabled={loading || !ws.isActive}
                            onChange={() => handleToggleDefault(ws._id)}
                          />
                        }
                        label={<Typography variant="caption">Default</Typography>}
                      />
                    </Grid>
                    <Grid size={{ xs: 3 }} sx={{ textAlign: 'right' }}>
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Tooltip title={ws.isActive ? 'Disable' : 'Enable'}>
                          <IconButton
                            color={ws.isActive ? 'warning' : 'success'}
                            size="small"
                            disabled={loading}
                            onClick={() => handleToggleActive(ws._id)}
                          >
                            {ws.isActive ? <DeleteIcon /> : <CheckIcon />}
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            ))
          ) : (
            <Typography variant="body1" sx={{ textAlign: 'center' }}>No records found</Typography>
          )}
        </motion.div>
      </AnimatePresence>
    </Box>
  );
}

export default WaistSizeCatalogSx;
