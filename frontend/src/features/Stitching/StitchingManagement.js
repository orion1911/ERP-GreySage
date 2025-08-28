import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { Container, Paper, Typography, Box, Button, TextField, Skeleton, Link } from '@mui/material';
import { ContentCut } from '@mui/icons-material';
import apiService from '../../services/apiService';
import StitchingGrid from './StitchingGrid';
import AddStitchingModal from './AddStitchingModal';
import AddWashingModal from '../Washing/AddWashingModal';
import AddFinishingModal from '../Finishing/AddFinishingModal';

function StitchingManagement() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { showSnackbar } = useOutletContext();

  const [stitchingRecords, setStitchingRecords] = useState();
  const [washingRecords, setWashingRecords] = useState();
  const [finishingRecords, setFinishingRecords] = useState();
  const [hasWashing, setHasWashing] = useState(false);
  const [hasFinishing, setHasFinishing] = useState(false);
  const [order, setOrder] = useState(null);
  const [stitchingVendors, setStitchingVendors] = useState([]);
  const [washingVendors, setWashingVendors] = useState([]);
  const [finishingVendors, setFinishingVendors] = useState([]);
  const [openStitchingModal, setOpenStitchingModal] = useState(false);
  const [openWashingModal, setOpenWashingModal] = useState(false);
  const [openFinishingModal, setOpenFinishingModal] = useState(false);
  const [selectedLot, setSelectedLot] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedWashingRecord, setSelectedWashingRecord] = useState(null);
  const [selectedFinishingRecord, setSelectedFinishingRecord] = useState(null);
  const [totalStitchedQuantity, setTotalStitchedQuantity] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = async () => {
    try {
      const [stitchingRes, orderRes, stitchingVendorsRes, washingVendorsRes, finishingVendorsRes] = await Promise.all([
        apiService.stitching.getStitching('', orderId, ''),
        apiService.orders.getOrderById(orderId),
        apiService.stitchingVendors.getStitchingVendors(),
        apiService.washingVendors.getWashingVendors(),
        apiService.finishingVendors.getFinishingVendors()
      ]);
      setTimeout(() => setStitchingRecords(stitchingRes), process.env.REACT_APP_DATA_LOAD_TIMEOUT);
      setTimeout(() => setOrder(orderRes), process.env.REACT_APP_DATA_LOAD_TIMEOUT);
      setStitchingVendors(stitchingVendorsRes);
      setWashingVendors(washingVendorsRes);
      setFinishingVendors(finishingVendorsRes);
      const total = stitchingRes.reduce((sum, record) => sum + record.quantity, 0);
      setTotalStitchedQuantity(total);
    } catch (err) {
      console.log(err.response);
      showSnackbar(err);
    }
  };

  useEffect(() => {
    orderId && fetchData();
  }, [orderId]);

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
      alert(err.response?.error || 'An error occurred while fetching washing records');
    }
  };

  const fetchFinishingRecords = async (lotId) => {
    try {
      if (!lotId) return;
      const finishingRes = await apiService.finishing.getFinishing('', lotId, '');
      setFinishingRecords(prev => ({ ...prev, [lotId]: finishingRes }));
    } catch (err) {
      alert(err.response?.error || 'An error occurred while fetching finishing records');
    }
  };

  const handleAddStitching = (newStitching) => {
    if (selectedRecord && selectedRecord._id === newStitching._id) {
      setStitchingRecords(stitchingRecords.map(record =>
        record._id === newStitching._id ? newStitching : record
      ));
      setTotalStitchedQuantity(stitchingRecords.reduce((sum, record) =>
        record._id === newStitching._id ? sum + Number(newStitching.quantity) : sum + Number(record.quantity),
        0
      ));
    } else {
      setStitchingRecords([...stitchingRecords, newStitching]);
      setTotalStitchedQuantity(prev => prev + Number(newStitching.quantity));
    }
    setSelectedRecord(null);
    setOpenStitchingModal(false);
  };

  const handleUpdateStitchOut = (id, stitchOutDate) => {
    apiService.stitching.updateStitchingStatus(id, { stitchOutDate })
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
    } else {
      setWashingRecords(prev => ({
        ...prev,
        [lotId]: [...(prev[lotId] || []), newWashing]
      }));
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
      {!order ? (<Skeleton animation="wave" variant="text" sx={{ marginBottom: 2, width: '60%' }} />) : (
        <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
          <Link
            component="button"
            onClick={() => navigate('/orders')}
            sx={{ fontSize: '14px', fontWeight: 'bold', textAlign: 'left', textDecoration: 'none !important' }}
            underline="none"
          >
            {order.orderId}
          </Link>
          <Typography>Total QTY: <b>{order.totalQuantity}</b></Typography>
          <Typography>Remaining QTY: <b>{order.totalQuantity - totalStitchedQuantity}</b></Typography>
        </Box>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <TextField
          label="Search Stitching"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          fullWidth
          variant="standard"
          sx={{ maxWidth: '190px' }}
        />
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
        onEditStitching={handleEditStitching}
        onEditWashing={handleEditWashing}
        onEditFinishing={handleEditFinishing}
      />
      <AddStitchingModal
        open={openStitchingModal}
        onClose={() => { setOpenStitchingModal(false); setSelectedRecord(null); }}
        orderId={orderId}
        vendors={stitchingVendors}
        onAddStitching={handleAddStitching}
        editRecord={selectedRecord}
      />
      <AddWashingModal
        open={openWashingModal}
        onClose={() => { setOpenWashingModal(false); setSelectedWashingRecord(null); }}
        orderId={orderId}
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
        orderId={orderId}
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