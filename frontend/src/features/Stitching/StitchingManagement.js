import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Typography, Box, Button, TextField, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { ContentCut } from '@mui/icons-material';
import apiService from '../../services/apiService';
import StitchingGrid from './StitchingGrid';
import AddStitchingModal from './AddStitchingModal';
import AddWashingModal from '../Washing/AddWashingModal';
import AddFinishingModal from '../Finishing/AddFinishingModal';

// Group a flat list of washing/finishing records into a { [lotId]: [...] } map —
// the shape the grids already consume. Lets us bulk-fetch once instead of per-lot.
const groupByLot = (records) => {
  const map = {};
  (records || []).forEach((r) => {
    const lid = r.lotId?._id;
    if (!lid) return;
    if (!map[lid]) map[lid] = [];
    map[lid].push(r);
  });
  return map;
};

function StitchingManagement() {
  const { showSnackbar } = useOutletContext();

  const [stitchingRecords, setStitchingRecords] = useState();
  const [washingRecords, setWashingRecords] = useState();
  const [finishingRecords, setFinishingRecords] = useState();
  const [hasWashing, setHasWashing] = useState(false);
  const [hasFinishing, setHasFinishing] = useState(false);
  const [stitchingVendors, setStitchingVendors] = useState([]);
  const [washingVendors, setWashingVendors] = useState([]);
  const [finishingVendors, setFinishingVendors] = useState([]);
  const [clients, setClients] = useState([]);
  const [fitStyles, setFitStyles] = useState([]);
  const [openStitchingModal, setOpenStitchingModal] = useState(false);
  const [openWashingModal, setOpenWashingModal] = useState(false);
  const [openFinishingModal, setOpenFinishingModal] = useState(false);
  const [selectedLot, setSelectedLot] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedWashingRecord, setSelectedWashingRecord] = useState(null);
  const [selectedFinishingRecord, setSelectedFinishingRecord] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');

  const fetchData = async () => {
    try {
      // Bulk-fetch washing + finishing once (each returns all records when unfiltered),
      // then group by lotId — replaces the old per-lot N+1 fan-out (2 calls per stitching row).
      const [stitchingRes, washingRes, finishingRes, stitchingVendorsRes, washingVendorsRes, finishingVendorsRes, clientsRes, fitStylesRes] = await Promise.all([
        apiService.stitching.getStitching(),
        apiService.washing.getWashing(),
        apiService.finishing.getFinishing(),
        apiService.stitchingVendors.getStitchingVendors(),
        apiService.washingVendors.getWashingVendors(),
        apiService.finishingVendors.getFinishingVendors(),
        apiService.client.getClients(),
        apiService.fitStyles.getFitstyles()
      ]);
      setTimeout(() => setStitchingRecords(stitchingRes), process.env.REACT_APP_DATA_LOAD_TIMEOUT);
      setWashingRecords(groupByLot(washingRes));
      setFinishingRecords(groupByLot(finishingRes));
      setStitchingVendors(stitchingVendorsRes);
      setWashingVendors(washingVendorsRes);
      setFinishingVendors(finishingVendorsRes);
      setClients(clientsRes);
      setFitStyles(fitStylesRes);
    } catch (err) {
      console.log(err.response);
      showSnackbar(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    washingRecords ? setHasWashing(true) : setHasWashing(false);
    finishingRecords ? setHasFinishing(true) : setHasFinishing(false);
  }, [washingRecords, finishingRecords]);

  const fetchWashingRecords = async (lotId) => {
    try {
      if (!lotId) return;
      const washingRes = await apiService.washing.getWashing('', lotId, '');
      setWashingRecords(prev => ({ ...prev, [lotId]: washingRes }));
    } catch (err) {
      showSnackbar(err.response?.error || 'An error occurred while fetching washing records');
    }
  };

  const fetchFinishingRecords = async (lotId) => {
    try {
      if (!lotId) return;
      const finishingRes = await apiService.finishing.getFinishing('', lotId, '');
      setFinishingRecords(prev => ({ ...prev, [lotId]: finishingRes }));
    } catch (err) {
      showSnackbar(err.response?.error || 'An error occurred while fetching finishing records');
    }
  };

  const handleAddStitching = (newStitching) => {
    if (selectedRecord && selectedRecord._id === newStitching._id) {
      const updatedRecords = stitchingRecords.map(record =>
        record._id === newStitching._id ? newStitching : record
      );
      setStitchingRecords(updatedRecords);
      // A stitching edit may have cascaded washing/finishing quantities — refresh them.
      const lid = newStitching.lotId?._id;
      if (lid) { fetchWashingRecords(lid); fetchFinishingRecords(lid); }
    } else {
      const updatedRecords = [...stitchingRecords, newStitching];
      setStitchingRecords(updatedRecords);
    }
    setSelectedRecord(null);
    setOpenStitchingModal(false);
  };

  const handleUpdateStitchOut = (id, stitchOutDate) => {
    apiService.stitching.updateStitchingStatus(id, stitchOutDate)
      .then(res => {
        setStitchingRecords(stitchingRecords.map(record => record._id === id ? res : record));
      });
  };

  const handleEditStitching = (record) => {
    setSelectedRecord(record);
    setOpenStitchingModal(true);
  };

  const handleAddWashing = (lotId, newWashing) => {
    if (selectedWashingRecord && selectedWashingRecord._id === newWashing._id) {
      setWashingRecords(prev => ({
        ...prev,
        [lotId]: prev[lotId].map(record =>
          record._id === newWashing._id ? newWashing : record
        )
      }));
      // A washing edit may have cascaded the finishing quantity — refresh it.
      fetchFinishingRecords(lotId);
    } else {
      setWashingRecords(prev => ({
        ...prev,
        [lotId]: [...(prev[lotId] || []), newWashing]
      }));
      // New washing auto-set the stitch-out date — reflect it on the stitching row.
      setStitchingRecords(prev => prev && prev.map(r =>
        r.lotId?._id === lotId && !r.stitchOutDate ? { ...r, stitchOutDate: newWashing.date } : r
      ));
    }
    setSelectedWashingRecord(null);
    setOpenWashingModal(false);
  };

  const handleUpdateWashOut = (lotId, id, washOutDate) => {
    apiService.washing.updateWashingStatus(id, washOutDate)
      .then(res => {
        setWashingRecords(prev => ({
          ...prev,
          [lotId]: prev[lotId].map(record => record._id === id ? res : record)
        }));
      });
  };

  const handleEditWashing = (record) => {
    setSelectedWashingRecord(record);
    setOpenWashingModal(true);
  };

  const handleAddFinishing = (lotId, newFinishing) => {
    if (selectedFinishingRecord && selectedFinishingRecord._id === newFinishing._id) {
      setFinishingRecords(prev => ({
        ...prev,
        [lotId]: prev[lotId].map(record =>
          record._id === newFinishing._id ? newFinishing : record
        )
      }));
    } else {
      setFinishingRecords(prev => ({
        ...prev,
        [lotId]: [...(prev[lotId] || []), newFinishing]
      }));
      // New finishing auto-set the wash-out date — reflect it on the washing row(s).
      setWashingRecords(prev => (prev && prev[lotId]) ? {
        ...prev,
        [lotId]: prev[lotId].map(w => !w.washOutDate ? { ...w, washOutDate: newFinishing.date } : w)
      } : prev);
    }
    setSelectedFinishingRecord(null);
    setOpenFinishingModal(false);
  };

  const handleUpdateFinishOut = (lotId, id, finishOutDate) => {
    apiService.finishing.updateFinishingStatus(id, finishOutDate)
      .then(res => {
        setFinishingRecords(prev => ({
          ...prev,
          [lotId]: prev[lotId].map(record => record._id === id ? res : record)
        }));
      });
  };

  const handleEditFinishing = (record) => {
    setSelectedFinishingRecord(record);
    setOpenFinishingModal(true);
  };

  return (
    <>
      <Typography variant="h4" sx={{ mb: 1 }}>Stitching Management</Typography>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextField
            label="Search Stitching"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            variant="standard"
            sx={{ width: '190px' }}
          />
          <FormControl variant="standard" sx={{ minWidth: 150 }}>
            <InputLabel>Vendor</InputLabel>
            <Select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} label="Vendor">
              <MenuItem value=""><em>All Vendors</em></MenuItem>
              {stitchingVendors.map(v => (
                <MenuItem key={v._id} value={v._id}>{v.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl variant="standard" sx={{ minWidth: 150 }}>
            <InputLabel>Client</InputLabel>
            <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} label="Client">
              <MenuItem value=""><em>All Clients</em></MenuItem>
              {clients.map(c => (
                <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Button variant="contained" endIcon={<ContentCut />} onClick={() => { setSelectedRecord(null); setOpenStitchingModal(true); }} sx={{ mt: 2 }}>
          Add
        </Button>
      </Box>
      <StitchingGrid
        stitchingRecords={stitchingRecords}
        washingRecords={washingRecords}
        finishingRecords={finishingRecords}
        hasWashing={hasWashing}
        hasFinishing={hasFinishing}
        fetchWashingRecords={fetchWashingRecords}
        fetchFinishingRecords={fetchFinishingRecords}
        handleUpdateStitchOut={handleUpdateStitchOut}
        handleUpdateWashOut={handleUpdateWashOut}
        handleUpdateFinishOut={handleUpdateFinishOut}
        setOpenWashingModal={setOpenWashingModal}
        setOpenFinishingModal={setOpenFinishingModal}
        setSelectedLot={setSelectedLot}
        searchTerm={searchTerm}
        vendorFilter={vendorFilter}
        clientFilter={clientFilter}
        onEditStitching={handleEditStitching}
        onEditWashing={handleEditWashing}
        onEditFinishing={handleEditFinishing}
      />
      <AddStitchingModal
        open={openStitchingModal}
        onClose={() => { setOpenStitchingModal(false); setSelectedRecord(null); }}
        clients={clients}
        fitStyles={fitStyles}
        vendors={stitchingVendors}
        onAddStitching={handleAddStitching}
        editRecord={selectedRecord}
      />
      <AddWashingModal
        open={openWashingModal}
        onClose={() => { setOpenWashingModal(false); setSelectedWashingRecord(null); }}
        lotNumber={selectedWashingRecord?.lotId?.lotNumber || selectedLot?.lotNumber || ''}
        lotId={selectedWashingRecord?.lotId?._id || selectedLot?.lotId || ''}
        invoiceNumber={selectedWashingRecord?.lotId?.invoiceNumber || selectedLot?.invoiceNumber || ''}
        lotQuantity={selectedLot?.lotQuantity || ''}
        vendors={washingVendors}
        onAddWashing={handleAddWashing}
        editRecord={selectedWashingRecord}
      />
      <AddFinishingModal
        open={openFinishingModal}
        onClose={() => { setOpenFinishingModal(false); setSelectedFinishingRecord(null); }}
        lotNumber={selectedFinishingRecord?.lotId?.lotNumber || selectedLot?.lotNumber || ''}
        lotId={selectedFinishingRecord?.lotId?._id || selectedLot?.lotId || ''}
        invoiceNumber={selectedFinishingRecord?.lotId?.invoiceNumber || selectedLot?.invoiceNumber || ''}
        lotQuantity={selectedLot?.lotQuantity || ''}
        vendors={finishingVendors}
        onAddFinishing={handleAddFinishing}
        editRecord={selectedFinishingRecord}
      />
    </>
  );
}

export default StitchingManagement;
