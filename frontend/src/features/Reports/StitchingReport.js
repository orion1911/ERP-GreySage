import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  useTheme, Container, Box, Button, Checkbox, Chip, CircularProgress, FormControl, FormControlLabel,
  Grid, InputLabel, ListItemText, MenuItem, Paper, Select, Stack, Switch, Table, TableBody, TableCell,
  TableContainer, TableFooter, TableHead, TablePagination, TableRow, TableSortLabel, Typography,
} from '@mui/material';
import { FileDownload as FileDownloadIcon, PictureAsPdf as PictureAsPdfIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import apiService from '../../services/apiService';
import {
  STATUS_LABELS, STATUS_ORDER, DEFAULT_STATUSES, VIEW, FOOTNOTE,
  summarise, buildSummaryTables, lotColumns, describeReport, exportExcel, exportPdf,
  formatCell, fmtInt, fmtDay,
} from './stitchingReportUtils';

const dayStr = (d) => (d && d.isValid() ? d.format('YYYY-MM-DD') : '');
const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '—');

const cellValue = (c, r) => {
  const v = c.get(r);
  if (c.type === 'date') return fmtDay(v) || '-';
  if (c.type === 'int') return v === null || v === undefined ? '-' : fmtInt(v);
  return v === null || v === undefined || v === '' ? '-' : v;
};

const SummaryTable = ({ table }) => {
  const align = (i) => (i >= table.numericFrom ? 'right' : 'left');
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>{table.title}</Typography>
      <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {table.head.map((h, i) => (
                <TableCell key={i} align={align(i)} sx={{ whiteSpace: 'nowrap' }}>{h.toUpperCase()}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {table.body.map((row, r) => (
              <TableRow key={r} hover>
                {row.map((v, i) => (
                  <TableCell key={i} align={align(i)} sx={{ fontSize: '0.85rem' }}>{formatCell(v)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          {table.foot && (
            <TableFooter>
              <TableRow>
                {table.foot.map((v, i) => (
                  <TableCell key={i} align={align(i)} sx={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'text.primary' }}>
                    {formatCell(v)}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </TableContainer>
    </Box>
  );
};

export default function StitchingReport() {
  const theme = useTheme();
  const { showSnackbar } = useOutletContext();
  const isAdmin = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user'))?.role === 'admin'; } catch { return false; }
  }, []);

  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [from, setFrom] = useState(null); // dayjs | null
  const [to, setTo] = useState(null);
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES);
  const [fullView, setFullView] = useState(false);
  const [report, setReport] = useState(null); // { client, rows, filters } as loaded
  const [excluded, setExcluded] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const [lotPage, setLotPage] = useState(0);
  const [lotRowsPerPage, setLotRowsPerPage] = useState(25);
  const [lotSortBy, setLotSortBy] = useState(''); // '' = report order (maker bill)
  const [lotSortOrder, setLotSortOrder] = useState('desc');
  const reqSeq = useRef(0);

  // Full details is internal: admins only. Everyone else always gets the client copy.
  const view = isAdmin && fullView ? VIEW.FULL : VIEW.CLIENT;

  useEffect(() => {
    apiService.client.getClients('', true)
      .then((list) => setClients(Array.isArray(list) ? list : []))
      .catch((e) => showSnackbar(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromStr = dayStr(from);
  const toStr = dayStr(to);
  const rangeBad = !!(fromStr && toStr && fromStr > toStr);
  const statusKey = [...statuses].sort((a, b) => a - b).join(',');

  // Reload whenever a filter changes, like Vendor Payments reloading on vendor change.
  // Only the latest request may apply its result.
  useEffect(() => {
    if (!clientId) {
      reqSeq.current += 1;
      setReport(null);
      setLoading(false);
      return undefined;
    }
    if (rangeBad) return undefined;
    const filters = { clientId, from: fromStr, to: toStr, statuses: statusKey ? statusKey.split(',').map(Number) : [] };
    const timer = setTimeout(async () => {
      const seq = ++reqSeq.current;
      setLoading(true);
      try {
        const params = { clientId };
        if (fromStr) params.from = fromStr;
        if (toStr) params.to = toStr;
        if (statusKey) params.status = statusKey;
        const data = await apiService.reports.getStitchingReport(params);
        if (seq !== reqSeq.current) return;
        setReport({ client: data.client, rows: data.rows || [], filters });
        setExcluded(new Set()); // every lot ticked after a load
        setLotPage(0);
      } catch (e) {
        if (seq === reqSeq.current) showSnackbar(e);
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, fromStr, toStr, statusKey, rangeBad]);

  const rows = useMemo(() => report?.rows || [], [report]);
  const allIds = useMemo(() => rows.map((r) => r.lotId), [rows]);
  const included = useMemo(() => rows.filter((r) => !excluded.has(r.lotId)), [rows, excluded]);
  const summary = useMemo(() => summarise(included), [included]);
  const tables = useMemo(() => buildSummaryTables(summary, view), [summary, view]);
  const cols = useMemo(() => lotColumns(view), [view]);
  const description = report
    ? describeReport({ filters: report.filters, loaded: rows.length, included: included.length, view })
    : '';

  // Screen-only sort. Exports keep the report order (maker bill), as sent to clients.
  const sortedRows = useMemo(() => {
    const c = cols.find((x) => x.key === lotSortBy);
    if (!c) return rows;
    const dir = lotSortOrder === 'asc' ? 1 : -1;
    const val = (r) => {
      const v = c.get(r);
      if (c.type === 'date') return v ? new Date(v).getTime() : null;
      return v === '' ? null : v;
    };
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1; // blanks last
      if (y == null) return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return String(x).localeCompare(String(y), 'en', { numeric: true }) * dir;
    });
  }, [rows, cols, lotSortBy, lotSortOrder]);

  const pagedRows = useMemo(
    () => sortedRows.slice(lotPage * lotRowsPerPage, (lotPage + 1) * lotRowsPerPage),
    [sortedRows, lotPage, lotRowsPerPage],
  );

  const handleLotSort = (key) => {
    if (lotSortBy === key) {
      setLotSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setLotSortBy(key);
      setLotSortOrder('desc');
    }
  };

  const toggleLot = (id) => setExcluded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setAll = (on) => setExcluded(on ? new Set() : new Set(allIds));

  const runExport = async (kind) => {
    if (!included.length) { showSnackbar('Tick at least one lot to export', 'warning'); return; }
    setExporting(kind);
    try {
      const args = { client: report.client, rows: included, view, description };
      await (kind === 'xlsx' ? exportExcel(args) : exportPdf(args));
    } catch (e) {
      showSnackbar(e?.message || 'Export failed');
    } finally {
      setExporting('');
    }
  };

  const t = summary.totals;
  const ticked = rows.length - excluded.size;
  const colSpan = cols.length + 1;
  const prefix = view === VIEW.FULL ? 'Internal ' : 'Client ';
  const panelHeader = {
    p: 1, pl: 2, minHeight: 48, borderBottom: `1px solid ${theme.palette.divider}`,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
  };
  const stats = [
    { label: 'Lots', value: fmtInt(t.lots) },
    ...(view === VIEW.FULL ? [
      { label: 'Stitched', value: fmtInt(t.stitched) },
      { label: 'Short', value: fmtInt(t.short), color: t.short > 0 ? 'red' : undefined, note: `(${pct(t.short, t.stitched)})` },
      { label: 'Net', value: fmtInt(t.net) },
    ] : []),
    { label: 'Pcs*', value: fmtInt(t.pcs) },
  ];

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Container maxWidth="xl" sx={{ pt: '0 !important', pb: { xs: 12, md: 2 }, px: '0 !important' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 'bold' }}>Stitching Report</Typography>
          {view === VIEW.FULL && <Chip size="small" color="warning" label="INTERNAL" />}
        </Stack>

        {/* Filters + totals: same panel as Vendor Payments */}
        <Paper sx={{ p: { xs: 1.5, md: 2 }, mb: 2 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 6, md: 2 }}>
              <FormControl fullWidth margin="normal" variant="standard">
                <InputLabel>Client</InputLabel>
                <Select value={clientId} label="Client" onChange={(e) => setClientId(e.target.value)}>
                  <MenuItem value="">Select Client</MenuItem>
                  {clients.map((c) => (
                    <MenuItem key={c._id} value={c._id}>
                      {c.name}{c.isActive === false ? ' (Inactive)' : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6, sm: 6, md: 2 }}>
              <FormControl fullWidth margin="normal" variant="standard">
                <InputLabel shrink>Status</InputLabel>
                <Select
                  multiple
                  displayEmpty
                  value={statuses}
                  label="Status"
                  onChange={(e) => setStatuses(e.target.value)}
                  renderValue={(sel) => (sel.length
                    ? STATUS_ORDER.filter((s) => sel.includes(s)).map((s) => STATUS_LABELS[s]).join(', ')
                    : 'All statuses')}
                >
                  {STATUS_ORDER.map((s) => (
                    <MenuItem key={s} value={s} dense>
                      <Checkbox size="small" checked={statuses.includes(s)} sx={{ p: 0.5, mr: 1 }} />
                      <ListItemText primary={STATUS_LABELS[s]} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6, sm: 6, md: 2 }}>
              <DatePicker
                label="Lot Date From"
                format="DD-MMM-YYYY"
                value={from}
                onChange={(v) => setFrom(v)}
                slotProps={{ textField: { variant: 'standard', fullWidth: true, margin: 'normal' }, field: { clearable: true } }}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 6, md: 2 }}>
              <DatePicker
                label="Lot Date To"
                format="DD-MMM-YYYY"
                value={to}
                onChange={(v) => setTo(v)}
                slotProps={{
                  textField: {
                    variant: 'standard', fullWidth: true, margin: 'normal',
                    error: rangeBad, helperText: rangeBad ? 'Before the "from" date' : undefined,
                  },
                  field: { clearable: true },
                }}
              />
            </Grid>
            {isAdmin && (
              <Grid size={{ xs: 12, sm: 6, md: 2 }} sx={{ display: 'flex', alignItems: 'flex-end' }}>
                <FormControlLabel
                  sx={{ mb: 1 }}
                  control={<Switch size="small" checked={fullView} onChange={(e) => setFullView(e.target.checked)} />}
                  label={<Typography variant="caption">Full details (internal)</Typography>}
                />
              </Grid>
            )}
          </Grid>

          {report && clientId && (
            <Grid container spacing={2} sx={{ mt: 2 }}>
              {stats.map((s) => (
                <Grid key={s.label} size={{ xs: 6, sm: 6, md: 2 }}>
                  <Typography color="textSecondary" gutterBottom>{s.label}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Typography variant="h6" sx={s.color ? { color: s.color } : undefined}>{s.value}</Typography>
                    {s.note && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 0.8 }}>{s.note}</Typography>
                    )}
                  </Box>
                </Grid>
              ))}
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    startIcon={exporting === 'xlsx' ? <CircularProgress size={14} color="inherit" /> : <FileDownloadIcon />}
                    disabled={!!exporting || !included.length}
                    onClick={() => runExport('xlsx')}
                  >
                    {prefix}Excel
                  </Button>
                  <Button
                    variant="outlined"
                    color="secondary"
                    size="small"
                    startIcon={exporting === 'pdf' ? <CircularProgress size={14} color="inherit" /> : <PictureAsPdfIcon />}
                    disabled={!!exporting || !included.length}
                    onClick={() => runExport('pdf')}
                  >
                    {prefix}PDF
                  </Button>
                </Box>
              </Grid>
              <Grid size={12}>
                <Typography variant="caption" color="text.secondary">{description}</Typography>
              </Grid>
            </Grid>
          )}
        </Paper>

        {clientId && (
          <Box sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            gap: 2,
            mb: 2,
            alignItems: 'stretch',
            minHeight: { md: 580 },
            height: { xs: 'auto', md: 'calc(100vh - 340px)' },
          }}>
            {/* Left: lots. Tick to include; unticked rows dim like paid lots in Vendor Payments. */}
            <Paper elevation={1} sx={{
              borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column',
              flex: { xs: '0 0 60vh', md: '1.6 1 0' }, minHeight: 0,
            }}>
              <Box sx={panelHeader}>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Lots</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                  {rows.length ? `${ticked} of ${rows.length} ticked` : ''}
                </Typography>
              </Box>
              <TableContainer sx={{ flexGrow: 1, minHeight: 0 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          disabled={!rows.length}
                          checked={rows.length > 0 && excluded.size === 0}
                          indeterminate={excluded.size > 0 && ticked > 0}
                          onChange={(e) => setAll(e.target.checked)}
                        />
                      </TableCell>
                      {cols.map((c) => (
                        <TableCell
                          key={c.key}
                          align={c.type === 'int' ? 'right' : 'left'}
                          sortDirection={lotSortBy === c.key ? lotSortOrder : false}
                          sx={{ whiteSpace: 'nowrap' }}
                        >
                          <TableSortLabel
                            active={lotSortBy === c.key}
                            direction={lotSortBy === c.key ? lotSortOrder : 'asc'}
                            onClick={() => handleLotSort(c.key)}
                          >
                            {c.header.toUpperCase()}
                          </TableSortLabel>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loading && (
                      <TableRow>
                        <TableCell colSpan={colSpan} align="center"><CircularProgress size={20} /></TableCell>
                      </TableRow>
                    )}
                    {!loading && rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={colSpan} align="center">No lots match these filters</TableCell>
                      </TableRow>
                    )}
                    {!loading && pagedRows.map((r) => {
                      const on = !excluded.has(r.lotId);
                      return (
                        <TableRow key={r.lotId} hover onClick={() => toggleLot(r.lotId)}
                          sx={{ cursor: 'pointer', opacity: on ? 1 : 0.5 }}>
                          <TableCell padding="checkbox">
                            <Checkbox size="small" checked={on}
                              onClick={(e) => e.stopPropagation()} onChange={() => toggleLot(r.lotId)} />
                          </TableCell>
                          {cols.map((c) => (
                            <TableCell
                              key={c.key}
                              align={c.type === 'int' ? 'right' : 'left'}
                              sx={{
                                fontSize: '0.85rem',
                                whiteSpace: 'nowrap',
                                fontWeight: c.key === 'lotNumber' || c.key === 'pcs' ? 'bold' : 'normal',
                                color: c.key === 'short' && r.short > 0 ? 'red' : undefined,
                              }}
                            >
                              {cellValue(c, r)}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={rows.length}
                page={lotPage}
                onPageChange={(_, p) => setLotPage(p)}
                rowsPerPage={lotRowsPerPage}
                onRowsPerPageChange={(e) => { setLotRowsPerPage(parseInt(e.target.value, 10)); setLotPage(0); }}
                rowsPerPageOptions={[10, 25, 50, 100]}
                sx={{ flexShrink: 0, borderTop: `1px solid ${theme.palette.divider}` }}
              />
            </Paper>

            {/* Right: summary tables for the ticked lots */}
            <Paper elevation={1} sx={{
              borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column',
              flex: { xs: '0 0 auto', md: '1 1 0' }, minHeight: 0,
            }}>
              <Box sx={panelHeader}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Summary</Typography>
              </Box>
              <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', p: 1.5 }}>
                {loading && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={20} /></Box>
                )}
                {!loading && included.length === 0 && (
                  <Typography variant="body2" align="center" sx={{ py: 2 }}>No lots ticked</Typography>
                )}
                {!loading && included.length > 0 && (
                  <Stack spacing={2}>
                    {tables.map((tb) => <SummaryTable key={tb.title} table={tb} />)}
                    <Typography variant="caption" color="text.secondary">{FOOTNOTE[view]}</Typography>
                  </Stack>
                )}
              </Box>
            </Paper>
          </Box>
        )}
      </Container>
    </LocalizationProvider>
  );
}