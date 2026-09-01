import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, Button, IconButton, Typography, Box, Stack, Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Switch } from '@mui/material';
import { Straighten as StraightenIcon, Delete as DeleteIcon, Check as CheckIcon } from '@mui/icons-material';
import { TableRowsLoader, NoRecordRow } from '../../components/Skeleton/SkeletonLoader';
import apiService from '../../services/apiService';
import WaistSizeCatalogSx from './WaistSizeCatalogSx';
import WaistSizeCatalogAdd from './WaistSizeCatalogAdd';
import { motion, AnimatePresence } from 'motion/react';

// Catalog for the size columns a cutting sheet can carry (26–42, seeded by
// cutting-book-init.js). "Default" sizes are pre-selected on a new sheet — the book's
// usual 28–36; the rest sit in the add-column pool. Sizes always sort numerically,
// so there's no reorder mode here.
function WaistSizeCatalog() {
  const { showSnackbar, isMobile } = useOutletContext();
  const [sizes, setSizes] = useState([]);
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sizeToToggle, setSizeToToggle] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  const getWaistSizes = () => {
    setLoading(true);
    apiService.waistSizes.getWaistSizes(showInactive)
      .then(res => {
        setTimeout(() => {
          setSizes(res);
          setLoading(false);
        }, process.env.REACT_APP_DATA_LOAD_TIMEOUT || 0);
      })
      .catch(err => {
        setLoading(false);
        console.log(err);
        showSnackbar(err);
      });
  };

  useEffect(() => {
    getWaistSizes();
  }, [showInactive]);

  // Default toggle is low-stakes — flip it without a confirm dialog.
  const handleToggleDefault = (id) => {
    setLoading(true);
    apiService.waistSizes.toggleWaistSizeDefault(id)
      .then(() => { setLoading(false); getWaistSizes(); })
      .catch(err => { setLoading(false); console.log(err); showSnackbar(err); });
  };

  const handleToggleActive = (id) => {
    setSizeToToggle(id);
    setConfirmOpen(true);
  };

  const handleConfirmToggle = () => {
    if (!sizeToToggle) return;
    setLoading(true);
    apiService.waistSizes.toggleWaistSizeActive(sizeToToggle)
      .then(() => {
        setLoading(false);
        getWaistSizes();
        setConfirmOpen(false);
      })
      .catch(err => {
        setLoading(false);
        console.log(err);
        showSnackbar(err);
        setConfirmOpen(false);
      });
  };

  const handleCancelToggle = () => {
    setConfirmOpen(false);
    setSizeToToggle(null);
  };

  return (
    <>
      <Typography variant="h4" sx={{ mb: 1 }}>Waist Sizes</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <FormControlLabel
          control={<Switch size="small" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />}
          label={<Typography variant="caption">Inactive</Typography>}
        />
        <Stack direction="row" spacing={1} sx={{ display: { xs: 'none', sm: 'flex' } }}>
          <Button
            variant="contained"
            endIcon={<StraightenIcon />}
            onClick={() => setOpenModal(true)}
            disabled={loading}
          >
            Add
          </Button>
        </Stack>
      </Box>
      {isMobile ? (
        <WaistSizeCatalogSx
          sizes={sizes}
          loading={loading}
          handleToggleDefault={handleToggleDefault}
          handleToggleActive={handleToggleActive}
          onAdd={() => setOpenModal(true)}
        />
      ) : (
        <AnimatePresence mode="wait">
        <motion.div
          key={loading ? 'loading' : 'data'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell style={{ textAlign: 'center' }}>SIZE</TableCell>
                <TableCell style={{ textAlign: 'center' }}>DEFAULT ON NEW SHEET</TableCell>
                <TableCell style={{ textAlign: 'center' }}>ACTIONS</TableCell>
                <TableCell style={{ textAlign: 'center' }}>STATUS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading || !sizes ? (
                <TableRowsLoader colsNum={4} rowsNum={9} />
              ) : sizes.length > 0 ? (
                sizes.map(ws => (
                  <TableRow key={ws._id}>
                    <TableCell style={{ textAlign: 'center' }}>
                      <Typography variant="subtitle1" fontWeight="bold">{ws.size}</Typography>
                    </TableCell>
                    <TableCell style={{ textAlign: 'center' }}>
                      <Switch
                        size="small"
                        checked={!!ws.isDefault}
                        disabled={loading || !ws.isActive}
                        onChange={() => handleToggleDefault(ws._id)}
                      />
                    </TableCell>
                    <TableCell style={{ textAlign: 'center' }}>
                      <IconButton disabled={loading} color={ws.isActive ? 'warning' : 'success'} onClick={() => handleToggleActive(ws._id)} size="small">
                        {ws.isActive ? <DeleteIcon fontSize="small" /> : <CheckIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell style={{ textAlign: 'center' }}>{ws.isActive ? 'Active' : 'Inactive'}</TableCell>
                  </TableRow>
                ))
              ) : (
                <NoRecordRow />
              )}
            </TableBody>
          </Table>
        </TableContainer>
        </motion.div>
        </AnimatePresence>
      )}
      <WaistSizeCatalogAdd
        open={openModal}
        onClose={() => setOpenModal(false)}
        loading={loading}
        setLoading={setLoading}
        onAddSuccess={getWaistSizes}
      />
      <Dialog
        open={confirmOpen}
        onClose={handleCancelToggle}
        aria-labelledby="confirm-toggle-title"
        aria-describedby="confirm-toggle-description"
      >
        <DialogTitle id="confirm-toggle-title">
          Confirm Action
        </DialogTitle>
        <DialogContent id="confirm-toggle-description">
          Are you sure you want to {sizes.find(s => s._id === sizeToToggle)?.isActive ? 'disable' : 'enable'} this size?
          {sizes.find(s => s._id === sizeToToggle)?.isActive && ' It will no longer appear as a column option on new cutting sheets.'}
        </DialogContent>
        <DialogActions>
          <Button variant='contained' onClick={handleCancelToggle} color="primary">
            Cancel
          </Button>
          <Button variant='contained' onClick={handleConfirmToggle} color="error" autoFocus>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default WaistSizeCatalog;
