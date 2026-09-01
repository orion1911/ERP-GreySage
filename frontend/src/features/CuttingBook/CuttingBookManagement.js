import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TablePagination, TextField, Button, IconButton, Typography, Box, Stack, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip } from '@mui/material';
import { ContentCut as ContentCutIcon, Edit as EditIcon, Delete as DeleteIcon, PlaylistAdd as PlaylistAddIcon, Launch as LaunchIcon } from '@mui/icons-material';
import { TableRowsLoader, NoRecordRow } from '../../components/Skeleton/SkeletonLoader';
import apiService from '../../services/apiService';
import CuttingSheetModal from './CuttingSheetModal';
import CuttingBookGridSx from './CuttingBookGridSx';
import { motion, AnimatePresence } from 'motion/react';
import dayjs from 'dayjs';

// Chip for the sheet's lot: status 1 = Cut (waiting for stitching), everything above is
// already in the production pipeline where OrderStatusChip territory begins.
const LOT_STATUS = { 1: ['CUT', 'info'], 2: ['STITCHING', 'warning'], 3: ['WASHING', 'warning'], 4: ['FINISHING', 'warning'], 5: ['READY', 'success'], 6: ['PART DISPATCHED', 'success'], 7: ['DISPATCHED', 'success'] };
export const lotStatusChip = (status) => {
  const [label, color] = LOT_STATUS[status] || ['—', 'default'];
  return <Chip size="small" label={label} color={color} variant={status === 1 ? 'filled' : 'outlined'} />;
};

// The Cutting Book — Stage #0. Each sheet mirrors one section of the physical cutting
// register and owns exactly one Lot. "New Sheet" generates the lot number from the rows;
// "Attach to Lot" files a book entry against a lot created stitching-first.
function CuttingBookManagement() {
  const { showSnackbar, isMobile } = useOutletContext();
  const navigate = useNavigate();

  const [sheets, setSheets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('new'); // 'new' | 'attach'
  const [editSheet, setEditSheet] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Lookups shared with the sheet modal (fetched once per mount).
  const [clients, setClients] = useState([]);
  const [fitStyles, setFitStyles] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [masters, setMasters] = useState([]);
  const [waistSizes, setWaistSizes] = useState([]);

  const getSheets = useCallback(() => {
    setLoading(true);
    apiService.cuttingBook.getSheets({ search, page: page + 1, limit: rowsPerPage })
      .then(res => {
        setTimeout(() => {
          setSheets(res.sheets || []);
          setTotal(res.total || 0);
          setLoading(false);
        }, process.env.REACT_APP_DATA_LOAD_TIMEOUT || 0);
      })
      .catch(err => {
        setLoading(false);
        console.log(err);
        showSnackbar(err);
      });
  }, [search, page, rowsPerPage]);

  useEffect(() => { getSheets(); }, [getSheets]);

  useEffect(() => {
    Promise.all([
      apiService.client.getClients(),
      apiService.fitStyles.getFitstyles(),
      apiService.stitchingVendors.getStitchingVendors(),
      apiService.cuttingMasters.getCuttingMasters(),
      apiService.waistSizes.getWaistSizes()
    ])
      .then(([clientsRes, fitStylesRes, vendorsRes, mastersRes, waistSizesRes]) => {
        setClients(clientsRes || []);
        setFitStyles(fitStylesRes || []);
        setVendors(vendorsRes || []);
        setMasters(mastersRes || []);
        setWaistSizes(waistSizesRes || []);
      })
      .catch(err => {
        console.log(err);
        showSnackbar(err);
      });
  }, []);

  const openNew = () => { setEditSheet(null); setModalMode('new'); setModalOpen(true); };
  const openAttach = () => { setEditSheet(null); setModalMode('attach'); setModalOpen(true); };
  const openEdit = (sheet) => { setEditSheet(sheet); setModalMode('new'); setModalOpen(true); };

  const handleSaved = () => {
    setModalOpen(false);
    setEditSheet(null);
    getSheets();
    showSnackbar('Cutting sheet saved', 'success');
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setDeleting(true);
    apiService.cuttingBook.deleteSheet(deleteTarget._id)
      .then((res) => {
        setDeleting(false);
        setDeleteTarget(null);
        getSheets();
        showSnackbar(res.lotDeleted ? 'Sheet and its lot deleted' : 'Sheet deleted (lot kept)', 'success');
      })
      .catch(err => {
        setDeleting(false);
        console.log(err);
        showSnackbar(err);
      });
  };

  // In-pipeline lots deep-link to Stitching Management (the bell's ?search= pattern).
  const goToStitching = (sheet) => navigate(`/stitching?search=${encodeURIComponent(sheet.lotId?.lotNumber || '')}`);

  const sheetModal = (
    <CuttingSheetModal
      open={modalOpen}
      onClose={() => { setModalOpen(false); setEditSheet(null); }}
      mode={modalMode}
      editSheet={editSheet}
      clients={clients}
      fitStyles={fitStyles}
      vendors={vendors}
      masters={masters}
      waistSizes={waistSizes}
      onSaved={handleSaved}
    />
  );

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
      <DialogTitle>Delete cutting sheet?</DialogTitle>
      <DialogContent>
        {deleteTarget?.lotId?.status === 1 && !deleteTarget?.hasStitching ? (
          <>Sheet <strong>{deleteTarget?.lotId?.lotNumber}</strong> and its lot will BOTH be deleted (the lot was created by this sheet and has no stitching yet).</>
        ) : (
          <>The book entry for <strong>{deleteTarget?.lotId?.lotNumber}</strong> will be deleted. The lot and its production records stay untouched.</>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={() => setDeleteTarget(null)} color="primary">Cancel</Button>
        <Button variant="contained" onClick={handleDelete} color="error" disabled={deleting} autoFocus>
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  if (isMobile) {
    return (
      <>
        <Typography variant="h4" sx={{ mb: 1 }}>Cutting Book</Typography>
        <TextField
          label="Search lot no / series / fabric"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          variant="standard"
          fullWidth
          sx={{ mb: 1 }}
        />
        <CuttingBookGridSx
          sheets={sheets}
          loading={loading}
          total={total}
          page={page}
          rowsPerPage={rowsPerPage}
          setPage={setPage}
          setRowsPerPage={setRowsPerPage}
          onNew={openNew}
          onAttach={openAttach}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
          onGoToStitching={goToStitching}
        />
        {sheetModal}
        {deleteDialog}
      </>
    );
  }

  return (
    <>
      <Typography variant="h4" sx={{ mb: 1 }}>Cutting Book</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <TextField
          label="Search lot no / series / fabric"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          variant="standard"
          sx={{ width: 260, maxWidth: '100%' }}
        />
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<PlaylistAddIcon />} onClick={openAttach} disabled={loading}>
            Attach to Lot
          </Button>
          <Button variant="contained" endIcon={<ContentCutIcon />} onClick={openNew} disabled={loading}>
            New Sheet
          </Button>
        </Stack>
      </Box>
      <AnimatePresence mode="wait">
        <motion.div
          key={loading ? 'loading' : 'data'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['DATE', 'LOT NO', 'CLIENT', 'FIT STYLE', 'FABRIC', 'VENDOR', 'MASTER', 'TOTAL MTR', 'TOTAL PCS', 'AVG', 'STATUS', 'ACTIONS'].map(h => (
                    <TableCell key={h} style={{ textAlign: 'center', textWrap: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRowsLoader colsNum={12} rowsNum={10} />
                ) : sheets.length > 0 ? (
                  sheets.map(sheet => (
                    <TableRow key={sheet._id} hover>
                      <TableCell style={{ textAlign: 'center', textWrap: 'nowrap' }}>{dayjs(sheet.date).format('DD-MMM-YYYY')}</TableCell>
                      <TableCell style={{ textAlign: 'center', textWrap: 'nowrap' }}>
                        <Typography variant="body2" fontWeight="bold">{sheet.lotId?.lotNumber || '—'}</Typography>
                      </TableCell>
                      <TableCell style={{ textAlign: 'center' }}>{sheet.clientId?.name || '—'}</TableCell>
                      <TableCell style={{ textAlign: 'center' }}>{sheet.fitStyleId?.name || '—'}</TableCell>
                      <TableCell style={{ textAlign: 'center' }}>{sheet.fabric}</TableCell>
                      <TableCell style={{ textAlign: 'center' }}>{sheet.stitchingVendorId?.name || '—'}</TableCell>
                      <TableCell style={{ textAlign: 'center' }}>{sheet.masterId?.name || '—'}</TableCell>
                      <TableCell style={{ textAlign: 'center' }}>{sheet.totalMeters}</TableCell>
                      <TableCell style={{ textAlign: 'center' }}>{sheet.totalPcs}</TableCell>
                      <TableCell style={{ textAlign: 'center' }}>{sheet.avgConsumption}</TableCell>
                      <TableCell style={{ textAlign: 'center' }}>{lotStatusChip(sheet.lotId?.status)}</TableCell>
                      <TableCell style={{ textAlign: 'center', textWrap: 'nowrap' }}>
                        {sheet.lotId?.status > 1 && (
                          <Tooltip title="Open in Stitching">
                            <IconButton size="small" onClick={() => goToStitching(sheet)}>
                              <LaunchIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <IconButton size="small" onClick={() => openEdit(sheet)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => setDeleteTarget(sheet)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <NoRecordRow />
                )}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[10, 25, 50]}
            />
          </TableContainer>
        </motion.div>
      </AnimatePresence>
      {sheetModal}
      {deleteDialog}
    </>
  );
}

export default CuttingBookManagement;
