import React, { useState, useEffect } from 'react';
import { Typography, Box, TextField } from '@mui/material';
import { useOutletContext } from 'react-router-dom';
import apiService from '../../services/apiService';
import StitchingGrid from '../Stitching/StitchingGrid';

export default function LotsManagement() {
  const { showSnackbar } = useOutletContext();
  const [stitchingRecords, setStitchingRecords] = useState([]);
  const [washingRecords, setWashingRecords] = useState({});
  const [finishingRecords, setFinishingRecords] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  const fetchAllLots = async () => {
    try {
      const res = await apiService.stitching.getStitching();
      setStitchingRecords(res);
    } catch (err) {
      console.log(err);
      showSnackbar(err);
    }
  };

  const fetchWashingRecords = async (lotId) => {
    if (!lotId) return;
    try {
      const washingRes = await apiService.washing.getWashing('', lotId, '');
      setWashingRecords(prev => ({ ...prev, [lotId]: washingRes || [] }));
    } catch {
      setWashingRecords(prev => ({ ...prev, [lotId]: [] }));
    }
  };

  const fetchFinishingRecords = async (lotId) => {
    if (!lotId) return;
    try {
      const finishingRes = await apiService.finishing.getFinishing('', lotId, '');
      setFinishingRecords(prev => ({ ...prev, [lotId]: finishingRes || [] }));
    } catch {
      setFinishingRecords(prev => ({ ...prev, [lotId]: [] }));
    }
  };

  useEffect(() => {
    fetchAllLots();
  }, []);

  return (
    <>
      <Typography variant="h4" sx={{ mb: 2 }}>Lots Management</Typography>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <TextField
          label="Search Lots"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          variant="standard"
          sx={{ maxWidth: '200px' }}
        />
      </Box>

      <StitchingGrid
        stitchingRecords={stitchingRecords}
        washingRecords={washingRecords}
        finishingRecords={finishingRecords}
        fetchWashingRecords={fetchWashingRecords}
        fetchFinishingRecords={fetchFinishingRecords}
        searchTerm={searchTerm}
        readOnly={true}
      />
    </>
  );
}
