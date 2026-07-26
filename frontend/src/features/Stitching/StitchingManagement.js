import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { Typography, Box, Button, TextField, FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel, Tooltip } from '@mui/material';
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
  const { showSnackbar, isMobile } = useOutletContext();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

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
  const [prefillStitching, setPrefillStitching] = useState(null);
  const [washingPrefill, setWashingPrefill] = useState(null);
  const [finishingPrefill, setFinishingPrefill] = useState(null);
  const [selectedWashingRecord, setSelectedWashingRecord] = useState(null);
  const [selectedFinishingRecord, setSelectedFinishingRecord] = useState(null);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [vendorFilter, setVendorFilter] = useState('');
  const [noZipperFilter, setNoZipperFilter] = useState(false);
  const [washingVendorFilter, setWashingVendorFilter] = useState('');
  const [finishingVendorFilter, setFinishingVendorFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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

  // Re-fetch only the stitching list when the No Zipper toggle flips. Vendors, clients
  // and the washing/finishing groupings are unaffected, so re-running the whole 8-call
  // bulk load would be wasteful. Skips the first run because fetchData() already covered it.
  const skipFirstZipperFetch = useRef(true);
  useEffect(() => {
    if (skipFirstZipperFetch.current) { skipFirstZipperFetch.current = false; return; }
    let cancelled = false;
    apiService.stitching
      .getStitching('', '', noZipperFilter)
      .then((res) => { if (!cancelled) setStitchingRecords(res); })
      .catch((err) => { if (!cancelled) showSnackbar(err); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noZipperFilter]);

  // Deep-link support: the notification bell navigates here with ?search=<lotNumber>.
  // Sync it into the search box even when the page is already mounted.
  useEffect(() => {
    const q = searchParams.get('search');
    if (q != null) setSearchTerm(q);
  }, [searchParams]);

  // Prefill support: the bell sends a "Not in DB" lot here via navigation state to open
  // the Add Stitching form pre-filled with the excel values. Resolve the excel client/
  // vendor NAMES to their ids (needs clients + vendors loaded), then open the modal and
  // clear the nav state so it doesn't re-open on later renders.
  useEffect(() => {
    const pf = location.state?.prefillStitching;
    if (!pf || !clients.length || !stitchingVendors.length || !fitStyles.length) return;
    const norm = (s) => (s || '').trim().toLowerCase();
    const client = clients.find((c) => norm(c.name) === norm(pf.clientName));
    const vendor = stitchingVendors.find((v) => norm(v.name) === norm(pf.vendorName));
    // STYLE → Fit Style: resolve against the lookup; if it doesn't match, keep the raw
    // name so the form can show it as a hint for the user to pick the right one.
    const fitStyle = fitStyles.find((f) => norm(f.name) === norm(pf.fitStyleName));
    setPrefillStitching({
      lotNumber: pf.lotNumber || '',
      invoiceNumber: pf.invoiceNumber != null ? String(pf.invoiceNumber) : '',
      clientId: client?._id || '',
      vendorId: vendor?._id || '',
      rate: vendor && Number(vendor.defaultRate) > 0 ? String(vendor.defaultRate) : '0',
      fitStyleId: fitStyle?._id || '',
      fitStyleName: pf.fitStyleName || '', // raw excel STYLE (hint when unmatched)
      fabric: pf.fabric || '',             // DETAILS → Fabric
      waistSize: pf.waistSize || '',       // SIZES → Waist Size
      quantity: pf.quantity != null ? String(pf.quantity) : '',
      threadColors: (pf.threadColors && pf.threadColors.length)
        ? pf.threadColors.map((t) => ({ color: t.color || '', quantity: t.quantity != null ? String(t.quantity) : '' }))
        : null,
      date: pf.date || null,
    });
    setSearchTerm(pf.lotNumber || ''); // filter the grid to this lot so the saved record shows
    setSelectedRecord(null);
    setOpenStitchingModal(true);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, clients, stitchingVendors, fitStyles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Locate the loaded stitching record for a lot (all records are loaded in the grid),
  // preferring an exact lotNumber + invoiceNumber match. Used to build selectedLot for
  // the washing/finishing prefill flows below.
  const findStitchRecord = (lotNumber, invoiceNumber) => {
    const recs = stitchingRecords || [];
    return recs.find((r) => r.lotId?.lotNumber === lotNumber
        && (invoiceNumber == null || String(r.lotId?.invoiceNumber) === String(invoiceNumber)))
      || recs.find((r) => r.lotId?.lotNumber === lotNumber);
  };

  // Bell: "washing missing" (WASH SD in excel) → open Add Washing pre-filled (washer→vendor,
  // date=WASH SD, quantity=pcs). Needs the stitching record (for lotId/available qty) + vendors.
  useEffect(() => {
    const pf = location.state?.prefillWashing;
    if (!pf || !stitchingRecords || !washingVendors.length) return;
    const rec = findStitchRecord(pf.lotNumber, pf.invoiceNumber);
    if (!rec) { setSearchTerm(pf.lotNumber || ''); navigate(location.pathname, { replace: true, state: {} }); return; }
    const norm = (s) => (s || '').trim().toLowerCase();
    const vendor = washingVendors.find((v) => norm(v.name) === norm(pf.washer));
    setSelectedLot({
      lotNumber: rec.lotId?.lotNumber || '',
      lotId: rec.lotId?._id || '',
      invoiceNumber: rec.lotId?.invoiceNumber || '',
      lotQuantity: (rec.quantity || 0) - (rec.quantityShort || 0),
    });
    setWashingPrefill({
      vendorId: vendor?._id || '',
      rate: vendor && Number(vendor.defaultRate) > 0 ? String(vendor.defaultRate) : '0',
      date: pf.date || null,
      quantity: pf.quantity != null ? String(pf.quantity) : '',
    });
    setSearchTerm(pf.lotNumber || ''); // filter the grid to this lot
    setSelectedWashingRecord(null);
    setOpenWashingModal(true);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, stitchingRecords, washingVendors]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bell: "finishing missing" (WASH ED in excel) → open Add Finishing pre-filled (date=WASH ED;
  // the finishing qty auto-fills from the washing record, and the finishing vendor is picked by
  // the user since the excel doesn't carry it).
  useEffect(() => {
    const pf = location.state?.prefillFinishing;
    if (!pf || !stitchingRecords) return;
    const rec = findStitchRecord(pf.lotNumber, pf.invoiceNumber);
    if (!rec) { setSearchTerm(pf.lotNumber || ''); navigate(location.pathname, { replace: true, state: {} }); return; }
    setSelectedLot({
      lotNumber: rec.lotId?.lotNumber || '',
      lotId: rec.lotId?._id || '',
      invoiceNumber: rec.lotId?.invoiceNumber || '',
      lotQuantity: rec.quantity || 0,
    });
    setFinishingPrefill({ date: pf.date || null, quantity: pf.quantity != null ? String(pf.quantity) : '' });
    setSearchTerm(pf.lotNumber || ''); // filter the grid to this lot
    setSelectedFinishingRecord(null);
    setOpenFinishingModal(true);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, stitchingRecords]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Downstream writes (add washing/finishing, mark finish-out) advance the lot's
  // status server-side and return it on the populated lotId. Copy that status onto
  // the matching stitching row(s) so the STATUS chip refreshes without a reload.
  const syncLotStatus = (lotId, status) => {
    if (!lotId || status == null) return;
    setStitchingRecords(prev => prev && prev.map(r =>
      r.lotId?._id === lotId ? { ...r, lotId: { ...r.lotId, status } } : r
    ));
  };

  // After any stitching/washing/finishing record is created or edited, re-diff that lot
  // against the MAKINGS excel (fast, server-side) and tell the notification bell to refresh
  // — so a discrepancy the user just resolved (e.g. the washing they created) drops off
  // immediately instead of lingering until the next full reconciliation.
  const refreshLotNotification = (record) => {
    const ln = record?.lotId?.lotNumber;
    const bill = record?.lotId?.invoiceNumber;
    if (!ln) return;
    apiService.makings.resolve(ln, bill)
      .then(() => window.dispatchEvent(new CustomEvent('makings:refresh')))
      .catch(() => {}); // non-critical
  };

  // Re-fetch a lot's freshly-saved records from the DB and merge them in, so the grid
  // (filtered to the searched lot after a bell prefill) reflects exactly what was
  // persisted — not just optimistic state. Also refreshes the lot's washing/finishing.
  const fetchLotFromDb = async (lotNumber, lotId) => {
    if (!lotNumber) return;
    try {
      const fresh = await apiService.stitching.getStitching(lotNumber);
      setStitchingRecords(prev => {
        const map = new Map((prev || []).map(r => [r._id, r]));
        (fresh || []).forEach(r => map.set(r._id, r)); // overwrite existing / add new
        return [...map.values()];
      });
      const lid = lotId || (fresh || [])[0]?.lotId?._id;
      if (lid) { fetchWashingRecords(lid); fetchFinishingRecords(lid); }
    } catch (err) { /* non-critical refresh */ }
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
    refreshLotNotification(newStitching);
    fetchLotFromDb(newStitching.lotId?.lotNumber, newStitching.lotId?._id);
    setSelectedRecord(null);
    setPrefillStitching(null);
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
      // New washing auto-set the stitch-out date AND advanced the lot status (→ Washing).
      // Reflect both on the stitching row(s) so the date + STATUS chip refresh without a reload.
      setStitchingRecords(prev => prev && prev.map(r =>
        r.lotId?._id === lotId
          ? {
              ...r,
              stitchOutDate: r.stitchOutDate || newWashing.date,
              lotId: { ...r.lotId, status: newWashing.lotId?.status ?? r.lotId?.status }
            }
          : r
      ));
    }
    refreshLotNotification(newWashing);
    fetchLotFromDb(newWashing.lotId?.lotNumber, newWashing.lotId?._id || lotId);
    setSelectedWashingRecord(null);
    setWashingPrefill(null);
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
      // New finishing advanced the lot status (→ Finishing) — refresh the STATUS chip.
      syncLotStatus(lotId, newFinishing.lotId?.status);
    }
    refreshLotNotification(newFinishing);
    fetchLotFromDb(newFinishing.lotId?.lotNumber, newFinishing.lotId?._id || lotId);
    setSelectedFinishingRecord(null);
    setFinishingPrefill(null);
    setOpenFinishingModal(false);
  };

  const handleUpdateFinishOut = (lotId, id, finishOutDate) => {
    apiService.finishing.updateFinishingStatus(id, finishOutDate)
      .then(res => {
        setFinishingRecords(prev => ({
          ...prev,
          [lotId]: prev[lotId].map(record => record._id === id ? res : record)
        }));
        // Marking finish-out advanced the lot status (→ Finished) — refresh the STATUS chip.
        syncLotStatus(lotId, res?.lotId?.status);
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
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
          <TextField
            label="Search Stitching"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            variant="standard"
            sx={{ width: isMobile ? 'auto' : '190px', flex: isMobile ? '1 1 45%' : 'none' }}
          />
          <FormControl variant="standard" sx={{ minWidth: isMobile ? 0 : 150, flex: isMobile ? '1 1 45%' : 'none' }}>
            <InputLabel>Stitching</InputLabel>
            <Select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} label="Stitching">
              <MenuItem value=""><em>All Stitching</em></MenuItem>
              {stitchingVendors.map(v => (
                <MenuItem key={v._id} value={v._id}>{v.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl variant="standard" sx={{ minWidth: isMobile ? 0 : 150, flex: isMobile ? '1 1 45%' : 'none' }}>
            <InputLabel>Washing</InputLabel>
            <Select value={washingVendorFilter} onChange={(e) => setWashingVendorFilter(e.target.value)} label="Washing">
              <MenuItem value=""><em>All Washing</em></MenuItem>
              {washingVendors.map(v => (
                <MenuItem key={v._id} value={v._id}>{v.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl variant="standard" sx={{ minWidth: isMobile ? 0 : 150, flex: isMobile ? '1 1 45%' : 'none' }}>
            <InputLabel>Finishing</InputLabel>
            <Select value={finishingVendorFilter} onChange={(e) => setFinishingVendorFilter(e.target.value)} label="Finishing">
              <MenuItem value=""><em>All Finishing</em></MenuItem>
              {finishingVendors.map(v => (
                <MenuItem key={v._id} value={v._id}>{v.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl variant="standard" sx={{ minWidth: isMobile ? 0 : 150, flex: isMobile ? '1 1 45%' : 'none' }}>
            <InputLabel>Client</InputLabel>
            <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} label="Client">
              <MenuItem value=""><em>All Clients</em></MenuItem>
              {clients.map(c => (
                <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl variant="standard" sx={{ minWidth: isMobile ? 0 : 150, flex: isMobile ? '1 1 45%' : 'none' }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} label="Status">
              <MenuItem value=""><em>All Statuses</em></MenuItem>
              <MenuItem value={2}>Stitching</MenuItem>
              <MenuItem value={3}>Washing</MenuItem>
              <MenuItem value={4}>Finishing</MenuItem>
              <MenuItem value={5}>Finished</MenuItem>
              <MenuItem value={6}>Part Dispatch</MenuItem>
              <MenuItem value={7}>Dispatched</MenuItem>
            </Select>
          </FormControl>
        </Box>
        {!isMobile && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 2 }}>
            <Tooltip title="Missing zipper">
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    color="warning"
                    checked={noZipperFilter}
                    onChange={(e) => setNoZipperFilter(e.target.checked)}
                  />
                }
                label="Missing Zipper"
                sx={{ mr: 0, whiteSpace: 'nowrap', '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
              />
            </Tooltip>
            <Button variant="contained" endIcon={<ContentCut />} onClick={() => { setSelectedRecord(null); setOpenStitchingModal(true); }}>
              Add
            </Button>
          </Box>
        )}
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
        washingVendorFilter={washingVendorFilter}
        finishingVendorFilter={finishingVendorFilter}
        clientFilter={clientFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        onAdd={() => { setSelectedRecord(null); setOpenStitchingModal(true); }}
        noZipperFilter={noZipperFilter}
        onToggleNoZipper={() => setNoZipperFilter((v) => !v)}
        onEditStitching={handleEditStitching}
        onEditWashing={handleEditWashing}
        onEditFinishing={handleEditFinishing}
      />
      <AddStitchingModal
        open={openStitchingModal}
        onClose={() => { setOpenStitchingModal(false); setSelectedRecord(null); setPrefillStitching(null); }}
        clients={clients}
        fitStyles={fitStyles}
        vendors={stitchingVendors}
        onAddStitching={handleAddStitching}
        editRecord={selectedRecord}
        prefill={prefillStitching}
      />
      <AddWashingModal
        open={openWashingModal}
        onClose={() => { setOpenWashingModal(false); setSelectedWashingRecord(null); setWashingPrefill(null); }}
        lotNumber={selectedWashingRecord?.lotId?.lotNumber || selectedLot?.lotNumber || ''}
        lotId={selectedWashingRecord?.lotId?._id || selectedLot?.lotId || ''}
        invoiceNumber={selectedWashingRecord?.lotId?.invoiceNumber || selectedLot?.invoiceNumber || ''}
        lotQuantity={selectedLot?.lotQuantity || ''}
        vendors={washingVendors}
        onAddWashing={handleAddWashing}
        editRecord={selectedWashingRecord}
        prefill={washingPrefill}
      />
      <AddFinishingModal
        open={openFinishingModal}
        onClose={() => { setOpenFinishingModal(false); setSelectedFinishingRecord(null); setFinishingPrefill(null); }}
        lotNumber={selectedFinishingRecord?.lotId?.lotNumber || selectedLot?.lotNumber || ''}
        lotId={selectedFinishingRecord?.lotId?._id || selectedLot?.lotId || ''}
        invoiceNumber={selectedFinishingRecord?.lotId?.invoiceNumber || selectedLot?.invoiceNumber || ''}
        lotQuantity={selectedLot?.lotQuantity || ''}
        vendors={finishingVendors}
        onAddFinishing={handleAddFinishing}
        editRecord={selectedFinishingRecord}
        prefill={finishingPrefill}
      />
    </>
  );
}

export default StitchingManagement;
