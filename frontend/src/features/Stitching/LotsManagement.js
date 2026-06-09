import React, { useState, useEffect } from 'react';
import { Typography, Box, TextField } from '@mui/material';
import { useOutletContext } from 'react-router-dom';
import apiService from '../../services/apiService';
import StitchingGrid from '../Stitching/StitchingGrid';

export default function LotsManagement() {
  const { showSnackbar } = useOutletContext();
  const [stitchingRecords, setStitchingRecords] = useState();
  const [washingRecords, setWashingRecords] = useState({});
  const [finishingRecords, setFinishingRecords] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  // Group a flat washing/finishing list into a { [lotId]: [...] } map for the grid.
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

  const fetchAllLots = async () => {
    try {
      // Bulk-fetch all three sets at once and group washing/finishing by lotId,
      // instead of firing a washing + finishing request per stitching row.
      const [res, washingRes, finishingRes] = await Promise.all([
        apiService.stitching.getStitching(),
        apiService.washing.getWashing(),
        apiService.finishing.getFinishing(),
      ]);
      setWashingRecords(groupByLot(washingRes));
      setFinishingRecords(groupByLot(finishingRes));
      setTimeout(() => setStitchingRecords(res), process.env.REACT_APP_DATA_LOAD_TIMEOUT);
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
