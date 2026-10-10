import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller, useFieldArray, useWatch } from 'react-hook-form';
import {
  Box, Modal, Typography, TextField, Button, IconButton, Grid,
  Autocomplete, MenuItem, Table, TableHead, TableRow, TableCell, TableBody,
  Stack, Divider, CircularProgress, Card, CardContent, useTheme,
  FormControlLabel, Switch, Chip, Alert, Tooltip
} from '@mui/material';
import {
  Close as CloseIcon, Save as SaveIcon, Publish as PublishIcon,
  Add as AddIcon, Delete as DeleteIcon, WarningAmber as WarningAmberIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';
import LotSelect from './LotSelect';

const fmtINR = (n) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

// Sum of good-remaining pcs across the lots selected for a merged line.
const sumRemaining = (mergeLots) => (mergeLots || []).reduce((a, l) => a + (Number(l.remainingPcs) || 0), 0);

// Allocate `total` pcs across the selected lots IN ORDER, each capped at its remainingPcs
// (FIFO: fill the first lot before spilling into the next). Returns [{ lotId, lotNumber, pcs }].
// If total exceeds the combined remaining, the leftover is simply not allocated (the caller
// then sees sum(sources) < total and blocks submit).
const computeFifoSources = (mergeLots, total) => {
  let left = Math.max(0, parseInt(total, 10) || 0);
  const out = [];
  for (const lot of (mergeLots || [])) {
    if (left <= 0) break;
    const cap = Math.max(0, Number(lot.remainingPcs) || 0);
    const take = Math.min(cap, left);
    if (take > 0) {
      out.push({ lotId: lot._id, lotNumber: lot.lotNumber, pcs: take });
      left -= take;
    }
  }
  return out;
};

// Tax Invoice split for a combined line. Nothing is consumed (stock follows the Bill of Supply),
// so the split is for the record only: fill lots in order up to the pcs each carried on the Bill
// of Supply (`bosPcs`; a newly picked lot is capped at its finalPcs), and anything above that
// lands on the LAST lot. Always sums to the typed total as long as at least one lot is picked.
const computeTaxSources = (mergeLots, total) => {
  const lots = mergeLots || [];
  let left = Math.max(0, parseInt(total, 10) || 0);
  const out = [];
  lots.forEach((lot, i) => {
    if (left <= 0) return;
    const cap = i === lots.length - 1 ? left : Math.max(0, Number(lot.bosPcs ?? lot.finalPcs) || 0);
    const take = Math.min(cap, left);
    if (take > 0) {
      out.push({ lotId: lot._id, lotNumber: lot.lotNumber, pcs: take });
      left -= take;
    }
  });
  return out;
};

// Owner of a SAVED line's lot when it differs from the invoice's client, read from the frozen
// snapshots so an edit is judged against what was true at issue time (the server does the same).
// Merged lines keep the snapshot per source; any foreign source makes the line cross-client.
// Returns a placeholder — the owner's real name is filled in by the effect below once the
// client list has loaded, which also clears house-label owners (never a cross-client sale).
const crossClientOwnerOf = (line, invoice) => {
  const billed = String(invoice?.clientId?._id || invoice?.clientId || '');
  const owners = (Array.isArray(line.sources) && line.sources.length > 0)
    ? line.sources.map((s) => s.lotClientIdSnapshot)
    : [line.lotClientIdSnapshot];
  return owners.some((o) => o && String(o) !== billed) ? 'another client' : '';
};

// Pre-filled on every new line (Bill of Supply and Tax Invoice); editable. Not a master list.
const DEFAULT_HSN = '620342';

const emptyLine = {
  lotId: null,
  lotNumber: '',
  lotInvoiceNumber: '',
  merged: false,      // true ⇒ this line draws from several lots, printed as one row
  mergeLots: [],      // selected lot options for a merged line (good pool only)
  sources: [],        // saved per-lot split [{lotId, lotNumber, pcs}] — used to lock merged lines on edit
  description: '',
  remark: '',
  internalNote: '',   // NOT printed — justification for a cross-client line
  hsnSac: DEFAULT_HSN, // men's woven cotton trousers / jeans
  taxRateOverride: '', // Tax Invoice only — GST % shown in the field (prefilled from the rules)
  taxRateTouched: false, // true once an admin types a rate → sent as an override; else the rule applies
  pcs: '',
  unit: '',
  rate: '',
  remainingPcs: null,
  finalPcs: null,
  notFinished: false,
  // Owner of the picked lot when it isn't the client being billed. Drives the amber
  // cross-client warning and makes the internal note mandatory before submit.
  crossClientOwner: '',
  // Edit mode: this combined line's lots or total were changed, so it is re-split (FIFO) on save.
  splitDirty: false,
  // OUTSIDE ITEM: goods bought in / not produced or tracked in our system — no lot, no stock
  // effect, billed like any other line (Bill of Supply and Tax Invoice). Marked explicitly so a
  // forgotten lot pick on a normal line can never silently skip stock.
  isManual: false,
  isSample: false
};

const emptySample = { ...emptyLine, hsnSac: '', isSample: true, description: 'SAMPLE ', rate: 0 };
const emptyManual = { ...emptyLine, isManual: true };

// A CHARGED sample (rate > 0) is saved as an ordinary priced line without a lot — billed, taxed
// on a Tax Invoice, no stock effect. On reload it is recognised by its "SAMPLE…" description and
// shown as a sample again. Free samples keep isSample with rate 0.
const isChargedSampleLine = (l) => !l.isSample && !l.lotId
  && !(Array.isArray(l.sources) && l.sources.length > 0)
  && Number(l.rate) > 0 && /^\s*SAMPLE\b/i.test(l.description || '');

// Form rows from a saved document's lines — Bill of Supply → Tax Invoice prefill, or a Tax
// Invoice being edited. Merged lines keep their frozen per-lot split (locked, like edit mode).
const taxLinesFromDoc = (doc, isTaxDoc) => (doc?.lines || []).map((l) => {
  const merged = Array.isArray(l.sources) && l.sources.length > 0;
  return {
    ...emptyLine,
    lotId: l.lotId || null,
    lotNumber: l.lotNumberSnapshot || '',
    lotInvoiceNumber: l.lotInvoiceNumberSnapshot || '',
    merged,
    mergeLots: merged ? l.sources.map((s) => ({ _id: s.lotId, lotNumber: s.lotNumberSnapshot, invoiceNumber: s.lotInvoiceNumberSnapshot, bosPcs: s.pcs })) : [],
    sources: merged ? l.sources.map((s) => ({ lotId: s.lotId, lotNumber: s.lotNumberSnapshot, pcs: s.pcs })) : [],
    description: l.description || '',
    remark: l.remark || '',
    hsnSac: l.isSample ? (l.hsnSac || '') : (l.hsnSac || DEFAULT_HSN),
    pcs: l.pcs,
    unit: l.unit || '',
    rate: l.rate,
    taxRateOverride: isTaxDoc && l.taxRate !== undefined && l.taxRate !== null ? String(l.taxRate) : '',
    taxRateTouched: isTaxDoc && l.taxRateSource === 'override',
    isManual: !l.isSample && !merged && !l.lotId && !isChargedSampleLine(l),
    isSample: !!l.isSample || isChargedSampleLine(l)
  };
});

function InvoiceFormModal({ open, onClose, onSaved, editInvoice, preset, taxSource, editTaxInvoice }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
  const theme = useTheme();
  // Tax Invoice mode: generating from a Bill of Supply (taxSource) or editing one (editTaxInvoice).
  // The Bill of Supply drives stock/money; a Tax Invoice is a GST document only — so no
  // availability caps, no combine/damaged/cross-client toggles, client + firm locked.
  const isTax = !!(taxSource || editTaxInvoice);
  const taxDoc = editTaxInvoice || taxSource || null;
  const isAdmin = (() => {
    try { return JSON.parse(localStorage.getItem('user'))?.role === 'admin'; } catch (e) { return false; }
  })();
  const [taxPreview, setTaxPreview] = useState(null); // { ok, preview?, error?, comparedToSource? }
  const [submitting, setSubmitting] = useState(false);
  const [clients, setClients] = useState([]);
  const [lotsForClient, setLotsForClient] = useState([]);
  const [damagedLots, setDamagedLots] = useState([]); // cross-client pool for damaged sale
  const [lotsLoading, setLotsLoading] = useState(false);

  const { control, handleSubmit, watch, setValue, reset, getValues } = useForm({
    defaultValues: {
      date: dayjs(),
      client: null,
      billingFirmId: '',
      documentType: 'BILL_OF_SUPPLY',
      damagedMode: false,
      crossClient: false,
      roundOff: 0,
      transportMode: '',
      vehicleNo: '',
      ewayBillNo: '',
      lines: [{ ...emptyLine }]
    }
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  // useWatch (not watch) — watch('lines') returns stale references and the totals
  // didn't recompute on each keystroke until something else re-rendered (e.g. "Add Line").
  const lines = useWatch({ control, name: 'lines' });
  const client = watch('client');
  const billingFirmId = watch('billingFirmId');
  const damagedMode = watch('damagedMode');
  const crossClient = watch('crossClient');
  const roundOff = Number(useWatch({ control, name: 'roundOff' })) || 0;

  // Default good-lot list: the client's own + in-house lots. Each picker's search box finds more.
  const pickerLots = lotsForClient;

  // Combined Damaged Sale draws from a cross-client pool; otherwise client-filtered good lots.
  const lotOptions = damagedMode ? damagedLots : pickerLots;

  // Fetch clients on open
  useEffect(() => {
    if (!open) return;
    apiService.client.getClients('').then(setClients).catch((e) => showSnackbar(e));
  }, [open]);

  // Resolve the selected client's full record so we can read addresses (the autocomplete
  // option only carries name/clientCode). Place of Supply derives from shippingAddress.
  const selectedClientFull = useMemo(() => {
    if (!client?._id) return null;
    return clients.find((c) => c._id === client._id) || null;
  }, [client?._id, clients]);

  // House labels own lots but are never billed, so they must not be selectable as the bill-to
  // party. The server rejects them too; this just stops the operator finding out at submit time.
  const billableClients = useMemo(() => clients.filter((c) => !c.isInternal), [clients]);

  const billingFirms = useMemo(() => selectedClientFull?.billingFirms || [], [selectedClientFull]);
  const selectedFirm = useMemo(
    () => (billingFirmId ? billingFirms.find((f) => String(f._id) === String(billingFirmId)) : null) || null,
    [billingFirmId, billingFirms]
  );

  // Auto-select a billing firm when the client has exactly one; otherwise default (''). Edit
  // keeps the frozen choice (hydrated in reset) — only run this for new invoices.
  useEffect(() => {
    if (!open || editInvoice || isTax || !selectedClientFull) return;
    setValue('billingFirmId', billingFirms.length === 1 ? String(billingFirms[0]._id) : '');
  }, [open, editInvoice, isTax, selectedClientFull?._id, billingFirms, setValue]);

  // Place of Supply derives from the chosen firm's address, falling back to the client's —
  // preferring the address that carries a GST state code (same rule as the server).
  const derivedPlaceOfSupply = useMemo(() => {
    const src0 = selectedFirm || selectedClientFull;
    const ship = src0?.shippingAddress;
    const bill = src0?.billingAddress;
    const src = ship?.stateCode ? ship : (bill?.stateCode ? bill : (ship?.state ? ship : bill));
    return {
      stateName: src?.state || '',
      stateCode: src?.stateCode || ''
    };
  }, [selectedFirm, selectedClientFull]);

  // A Tax Invoice shows the place of supply frozen on its source document. Editing a Bill of
  // Supply shows ITS frozen place of supply — unless that has no state code, in which case the
  // server takes the client's current details on save, so the master's value is shown.
  const posFromMaster = !!editInvoice && !editInvoice.placeOfSupply?.stateCode;
  const shownPos = isTax
    ? (taxDoc?.placeOfSupply || {})
    : (editInvoice && !posFromMaster ? (editInvoice.placeOfSupply || {}) : derivedPlaceOfSupply);

  // Hydrate when editing
  useEffect(() => {
    if (!open) return;
    if (isTax) {
      // Tax Invoice: prefilled from the Bill of Supply (new) or the saved Tax Invoice (edit).
      reset({
        date: editTaxInvoice ? dayjs(editTaxInvoice.date) : dayjs(),
        client: taxDoc?.clientId ? {
          _id: taxDoc.clientId._id || taxDoc.clientId,
          name: taxDoc.clientSnapshot?.name,
          clientCode: taxDoc.clientSnapshot?.clientCode
        } : null,
        billingFirmId: taxDoc?.billingFirmId ? String(taxDoc.billingFirmId) : '',
        documentType: 'TAX_INVOICE',
        damagedMode: false,
        crossClient: true,
        roundOff: editTaxInvoice ? (editTaxInvoice.roundOff || 0) : 0,
        transportMode: editTaxInvoice?.transportMode || '',
        vehicleNo: editTaxInvoice?.vehicleNo || '',
        ewayBillNo: editTaxInvoice?.ewayBillNo || '',
        lines: taxLinesFromDoc(taxDoc, !!editTaxInvoice)
      });
    } else if (editInvoice) {
      reset({
        date: dayjs(editInvoice.date),
        client: editInvoice.clientId ? {
          _id: editInvoice.clientId._id || editInvoice.clientId,
          name: editInvoice.clientSnapshot?.name,
          clientCode: editInvoice.clientSnapshot?.clientCode
        } : null,
        billingFirmId: editInvoice.billingFirmId ? String(editInvoice.billingFirmId) : '',
        documentType: editInvoice.documentType || 'BILL_OF_SUPPLY',
        // Preserve the invoice's nature on edit (a combined-damaged sale has isDamaged lines).
        // The toggle is hidden when editing, so this stays fixed at the hydrated value.
        damagedMode: (editInvoice.lines || []).some((l) => l.isDamaged),
        // An invoice that already contains another client's lots keeps the wider pool open
        // on edit — otherwise removing and re-adding the same line would be impossible.
        crossClient: (editInvoice.lines || []).some((l) => (
          l.lotClientIdSnapshot && String(l.lotClientIdSnapshot) !== String(editInvoice.clientId?._id || editInvoice.clientId)
        )),
        roundOff: editInvoice.roundOff || 0,
        lines: (editInvoice.lines || []).map((l) => {
          const merged = Array.isArray(l.sources) && l.sources.length > 0;
          return {
            lotId: l.lotId || null,
            lotNumber: l.lotNumberSnapshot || '',
            lotInvoiceNumber: l.lotInvoiceNumberSnapshot || '',
            merged,
            // Best-effort option-shaped objects so the (disabled) multi-select shows the lots.
            mergeLots: merged ? l.sources.map((s) => ({
              _id: s.lotId, lotNumber: s.lotNumberSnapshot, invoiceNumber: s.lotInvoiceNumberSnapshot,
              remainingPcs: s.pcs, finalPcs: s.pcs
            })) : [],
            // Frozen split — merged lines are locked on edit, so this is sent back unchanged.
            sources: merged ? l.sources.map((s) => ({
              lotId: s.lotId, lotNumber: s.lotNumberSnapshot, pcs: s.pcs
            })) : [],
            description: l.description || '',
            remark: l.remark || '',
            internalNote: l.internalNote || '',
            hsnSac: l.hsnSac || '',
            pcs: l.pcs,
            unit: l.unit || '',
            rate: l.rate,
            remainingPcs: null,
            finalPcs: null,
            // Recomputed from the frozen snapshots, not refetched — an edit must be judged
            // against the owner recorded at issue time, exactly as the server does.
            crossClientOwner: crossClientOwnerOf(l, editInvoice),
            // Saved line with no lot (and not a sample / combined line) = outside item.
            isManual: !l.isSample && !merged && !l.lotId && !isChargedSampleLine(l),
            isSample: !!l.isSample || isChargedSampleLine(l)
          };
        })
      });
    } else if (preset?.client || preset?.lot) {
      // Prefilled from the Pending Dispatch page: one good-dispatch line for the lot, plus the
      // client when there is one. House-label lots arrive with client null — the line is still
      // prefilled, and the buyer is chosen in the form.
      const lot = preset.lot;
      reset({
        date: dayjs(),
        client: preset.client
          ? { _id: preset.client._id, name: preset.client.name, clientCode: preset.client.clientCode }
          : null,
        billingFirmId: '',
        documentType: 'BILL_OF_SUPPLY',
        damagedMode: false,
        crossClient: false,
        roundOff: 0,
        lines: [lot ? {
          ...emptyLine,
          lotId: lot._id,
          lotNumber: lot.lotNumber,
          lotInvoiceNumber: lot.invoiceNumber,
          description: `${lot.fitStyleName || ''}${lot.fabric ? ` (${lot.fabric})` : ''} - LOT ${lot.lotNumber}`.trim(),
          pcs: lot.goodRemaining ?? '',
          remainingPcs: lot.goodRemaining ?? null,
          finalPcs: lot.finalPcs ?? null
        } : { ...emptyLine }]
      });
    } else {
      reset({
        date: dayjs(),
        client: null,
        billingFirmId: '',
        documentType: 'BILL_OF_SUPPLY',
        damagedMode: false,
        crossClient: false,
        roundOff: 0,
        lines: [{ ...emptyLine }]
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editInvoice, taxSource, editTaxInvoice, reset]);

  // Reload client-filtered good lots when client changes
  useEffect(() => {
    if (!open || !client?._id) {
      setLotsForClient([]);
      return;
    }
    setLotsLoading(true);
    // Default list: the client's own lots + house-label lots (GREYSAGE — common stock), whatever
    // the "Other clients' lots" switch says; that switch only widens the picker's SEARCH box to
    // every client. (Cheaper than loading ~1,000 lots, and the search finds lots of any age.)
    // A Tax Invoice only references lots (nothing is consumed), so its picker offers every lot,
    // fully-dispatched ones included.
    // Editing a Bill of Supply: excludeInvoiceId adds this invoice's own pcs back to each lot's
    // remaining, so combined lines can be re-split and its fully-used lots still appear (the
    // server also returns every lot the invoice holds, other clients' included).
    apiService.salesInvoices.getLotsAvailable({
      clientId: client._id,
      crossClient: isTax ? 'true' : undefined,
      includeDispatched: isTax ? 'true' : undefined,
      excludeInvoiceId: editInvoice ? editInvoice._id : undefined
    })
      .then((data) => setLotsForClient(data))
      .catch((e) => showSnackbar(e))
      .finally(() => setLotsLoading(false));
  }, [open, client?._id, isTax, editInvoice?._id]);

  // Picker search (🔍 / Enter) → Promise of matching lots; the picker then shows only those.
  // Scope follows the form:
  //   Combined damaged sale     → the damaged pool (any client)
  //   "Other clients' lots" ON  → every client's lots (each flagged with its owner)
  //   otherwise                 → this client + in-house, older lots included
  const searchLots = useCallback((term) => {
    if (!term || (!damagedMode && !client?._id)) return Promise.resolve([]);
    const req = damagedMode
      ? apiService.salesInvoices.getLotsDamagedAvailable({
        search: term, ...(editInvoice ? { excludeInvoiceId: editInvoice._id } : {})
      })
      : apiService.salesInvoices.getLotsAvailable({
        clientId: client._id,
        search: term,
        crossClient: (crossClient || isTax) ? 'true' : undefined,
        includeDispatched: isTax ? 'true' : undefined,
        excludeInvoiceId: editInvoice ? editInvoice._id : undefined
      });
    return req
      .then((data) => data || [])
      .catch((e) => { showSnackbar(e); return []; });
  }, [damagedMode, client?._id, crossClient, isTax, editInvoice?._id]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new client / switch starts every picker's search afresh.
  const lotSearchKey = `${open ? 1 : 0}|${client?._id || ''}|${crossClient ? 1 : 0}|${damagedMode ? 1 : 0}`;

  // Resolve the placeholder set by crossClientOwnerOf into real names, once the client list
  // is available. Also clears the flag where the owner turns out to be a house label — that
  // is ordinary stock movement, not a reassignment, and must not demand a justification.
  useEffect(() => {
    if (!open || !editInvoice || !clients.length) return;
    const byId = new Map(clients.map((c) => [String(c._id), c]));
    const billed = String(editInvoice.clientId?._id || editInvoice.clientId || '');
    (editInvoice.lines || []).forEach((l, i) => {
      const owners = (Array.isArray(l.sources) && l.sources.length > 0)
        ? l.sources.map((s) => s.lotClientIdSnapshot)
        : [l.lotClientIdSnapshot];
      const foreign = owners
        .filter((o) => o && String(o) !== billed)
        .map((o) => byId.get(String(o)))
        .filter((c) => c && !c.isInternal);
      setValue(`lines.${i}.crossClientOwner`,
        foreign.length ? [...new Set(foreign.map((c) => c.name))].join(', ') : '');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editInvoice, clients]);

  // Load the cross-client damaged pool when Combined Damaged Sale is toggled on
  useEffect(() => {
    if (!open || !damagedMode) {
      setDamagedLots([]);
      return;
    }
    setLotsLoading(true);
    apiService.salesInvoices.getLotsDamagedAvailable(editInvoice ? { excludeInvoiceId: editInvoice._id } : {})
      .then((data) => setDamagedLots(data))
      .catch((e) => showSnackbar(e))
      .finally(() => setLotsLoading(false));
  }, [open, damagedMode, editInvoice?._id]);

  // Live totals
  const totals = useMemo(() => {
    const subTotal = (lines || []).reduce((acc, l) => acc + (Number(l.pcs) || 0) * (Number(l.rate) || 0), 0);
    const totalQty = (lines || []).reduce((acc, l) => acc + (Number(l.pcs) || 0), 0);
    return {
      subTotal,
      totalQty,
      total: subTotal + roundOff
    };
  }, [lines, roundOff]);

  // Tax Invoice line payload, shared by the live preview and submit → { lines } | { error }.
  // HSN is mandatory on every chargeable line of a Tax Invoice.
  const buildTaxLines = useCallback((rows) => {
    const out = [];
    for (let i = 0; i < (rows || []).length; i++) {
      const l = rows[i] || {};
      const hsn = String(l.hsnSac || '').trim();
      const common = { description: l.description, remark: l.remark, hsnSac: hsn, unit: l.unit };
      // Free sample: non-chargeable, no tax. A charged sample (rate > 0) falls through and is
      // billed + taxed like any line without a lot (HSN required).
      if (l.isSample && !(Number(l.rate) > 0)) {
        out.push({ ...common, pcs: parseInt(l.pcs, 10), rate: 0, isSample: true });
        continue;
      }
      if (!hsn) return { error: `Line ${i + 1}: HSN is required on a Tax Invoice` };
      // Only a rate the admin actually changed is sent as an override; the rest follow the GST rules.
      const override = (!l.taxRateTouched || l.taxRateOverride === '' || l.taxRateOverride === null || l.taxRateOverride === undefined)
        ? undefined : Number(l.taxRateOverride);
      if (l.merged) {
        const split = computeTaxSources(l.mergeLots, l.pcs);
        if (!split.length) return { error: `Line ${i + 1}: pick the lots and total pcs for the combined line` };
        out.push({ ...common, rate: Number(l.rate), taxRateOverride: override, sources: split.map((s) => ({ lotId: s.lotId, pcs: s.pcs })) });
      } else {
        out.push({ ...common, lotId: l.lotId || null, pcs: parseInt(l.pcs, 10), rate: Number(l.rate), taxRateOverride: override });
      }
    }
    return { lines: out };
  }, []);

  // Live GST preview — computed by the server with the same code path as save, debounced.
  const formDate = useWatch({ control, name: 'date' });
  // Keyed on the PAYLOAD, not the raw form, so filling the GST % fields from the preview below
  // doesn't trigger another preview request.
  const previewKey = isTax ? JSON.stringify({ b: buildTaxLines(lines), roundOff, d: formDate ? dayjs(formDate).valueOf() : null }) : '';
  useEffect(() => {
    if (!open || !isTax || !taxDoc) { setTaxPreview(null); return undefined; }
    const built = buildTaxLines(lines);
    if (built.error) { setTaxPreview({ ok: false, error: built.error }); return undefined; }
    const t = setTimeout(() => {
      apiService.taxInvoices.preview({
        sourceInvoiceId: editTaxInvoice ? editTaxInvoice.sourceInvoiceId : taxSource._id,
        date: formDate ? dayjs(formDate).toISOString() : undefined,
        placeOfSupply: taxDoc.placeOfSupply,
        roundOff,
        lines: built.lines
      }).then(setTaxPreview).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isTax, previewKey]);

  // Fill each GST % field with the rate the server resolved from the GST rules, for every line
  // the admin hasn't overridden — the value sits IN the field instead of as a placeholder.
  useEffect(() => {
    if (!isTax || !taxPreview?.ok) return;
    (taxPreview.preview.lines || []).forEach((pl, idx) => {
      const cur = getValues(`lines.${idx}`);
      if (!cur || (cur.isSample && !(Number(cur.rate) > 0)) || cur.taxRateTouched) return;
      const v = pl.taxRate === undefined || pl.taxRate === null ? '' : String(pl.taxRate);
      if (cur.taxRateOverride !== v) setValue(`lines.${idx}.taxRateOverride`, v);
    });
  }, [isTax, taxPreview, lines, getValues, setValue]);

  // GST % for a Tax Invoice line. Admin: the field holds the rule's rate; typing a different rate
  // overrides it, clearing the field returns the line to the rule. Others: read-only.
  const lineTaxRate = (idx) => (taxPreview?.ok ? taxPreview.preview?.lines?.[idx]?.taxRate : undefined);
  const renderTaxRate = (idx) => (isAdmin ? (
    <Controller
      name={`lines.${idx}.taxRateOverride`}
      control={control}
      render={({ field }) => (
        <TextField {...field} type="number" variant="standard" size="small"
          onChange={(e) => { field.onChange(e); setValue(`lines.${idx}.taxRateTouched`, e.target.value !== ''); }}
          inputProps={{ min: 0, max: 100, step: 0.5, style: { textAlign: 'right' } }}
          sx={{ maxWidth: 72 }} />
      )}
    />
  ) : (
    <Typography variant="body2">{lineTaxRate(idx) !== undefined ? `${lineTaxRate(idx)}%` : '—'}</Typography>
  ));

  // When a lot is picked: prefill description, pcs (= remaining), rate stays user-entered
  const handleLotChange = useCallback((idx, lotOption) => {
    if (!lotOption) {
      setValue(`lines.${idx}.lotId`, null);
      setValue(`lines.${idx}.lotNumber`, '');
      setValue(`lines.${idx}.lotInvoiceNumber`, '');
      setValue(`lines.${idx}.remainingPcs`, null);
      setValue(`lines.${idx}.finalPcs`, null);
      setValue(`lines.${idx}.notFinished`, false);
      setValue(`lines.${idx}.crossClientOwner`, '');
      return;
    }
    // In damaged mode the available qty is the lot's damaged pool, not the good remaining.
    // Tax Invoice: nothing is consumed, so no cap (avail null) and pcs are typed by hand.
    const avail = isTax ? null : (damagedMode ? lotOption.damagedAvailable : lotOption.remainingPcs);
    const finalRef = damagedMode ? lotOption.damagedPcs : lotOption.finalPcs;
    setValue(`lines.${idx}.lotId`, lotOption._id);
    setValue(`lines.${idx}.lotNumber`, lotOption.lotNumber);
    setValue(`lines.${idx}.lotInvoiceNumber`, lotOption.invoiceNumber);
    setValue(`lines.${idx}.remainingPcs`, avail);
    setValue(`lines.${idx}.finalPcs`, finalRef);
    // Only meaningful for good dispatch; damaged-pool rows don't carry the flag.
    setValue(`lines.${idx}.notFinished`, !damagedMode && !!lotOption.notFinished);
    // Cross-client = produced for someone else, excluding house-label stock (sellable to
    // anyone by design) and damaged lines (already third-party sales by definition).
    const isCross = !damagedMode && !!lotOption.isCrossClient && !lotOption.isHouseLot;
    setValue(`lines.${idx}.crossClientOwner`, (isCross && !isTax) ? (lotOption.clientName || 'another client') : '');
    // Deliberately omit the lot number on a cross-client line: the description is printed,
    // and our lot numbering is per-client — showing GLOBUS a lot raised for ADAM HILL leaks
    // the origin. Operators can still type it back in if a given buyer expects it.
    const lotRef = isCross ? '' : ` - LOT ${lotOption.lotNumber}`;
    const desc = `${lotOption.fitStyleName || ''}${lotOption.fabric ? ` (${lotOption.fabric})` : ''}${lotRef}${damagedMode ? ' (DAMAGED)' : ''}`.trim();
    if (!getValues(`lines.${idx}.description`)) setValue(`lines.${idx}.description`, desc);
    if (!isTax && !getValues(`lines.${idx}.pcs`)) setValue(`lines.${idx}.pcs`, avail);
  }, [setValue, getValues, damagedMode, isTax]);

  // Toggle a line between single-lot and merged (multi-lot) mode; clear the other mode's state.
  const toggleMerge = useCallback((idx, on) => {
    setValue(`lines.${idx}.merged`, on);
    setValue(`lines.${idx}.splitDirty`, true);
    setValue(`lines.${idx}.lotId`, null);
    setValue(`lines.${idx}.lotNumber`, '');
    setValue(`lines.${idx}.lotInvoiceNumber`, '');
    setValue(`lines.${idx}.mergeLots`, []);
    setValue(`lines.${idx}.sources`, []);
    setValue(`lines.${idx}.remainingPcs`, null);
    setValue(`lines.${idx}.finalPcs`, null);
    setValue(`lines.${idx}.notFinished`, false);
    setValue(`lines.${idx}.crossClientOwner`, '');
    setValue(`lines.${idx}.isManual`, false);
  }, [setValue]);

  // Switch a line to an OUTSIDE ITEM (no lot) or back to a lot line. Clears any lot selection.
  const setManual = useCallback((idx, on) => {
    toggleMerge(idx, false);
    setValue(`lines.${idx}.isManual`, on);
    setValue(`lines.${idx}.internalNote`, '');
  }, [toggleMerge, setValue]);

  // Pick/clear the lots that make up a merged line. remainingPcs caps the line's total; the
  // description auto-fills (once) to a combined "LOT A + B" label the user can still edit.
  const changeMergeLots = useCallback((idx, lots) => {
    setValue(`lines.${idx}.mergeLots`, lots || []);
    // Tax Invoice: no stock cap on a combined line. Edit mode: the line is re-split from now on.
    setValue(`lines.${idx}.remainingPcs`, isTax ? null : sumRemaining(lots));
    setValue(`lines.${idx}.splitDirty`, true);
    setValue(`lines.${idx}.notFinished`, (lots || []).some((l) => l.notFinished));
    // A merged line can mix owners; ANY foreign lot makes the whole line cross-client.
    const foreign = (lots || []).filter((l) => l.isCrossClient && !l.isHouseLot);
    setValue(`lines.${idx}.crossClientOwner`,
      (foreign.length && !isTax) ? [...new Set(foreign.map((l) => l.clientName || 'another client'))].join(', ') : '');
    if (!getValues(`lines.${idx}.description`) && (lots || []).length) {
      const first = lots[0];
      const label = lots.map((l) => l.lotNumber).join(' + ');
      const desc = `${first.fitStyleName || ''}${first.fabric ? ` (${first.fabric})` : ''} - LOT ${label}`.trim();
      setValue(`lines.${idx}.description`, desc);
    }
  }, [setValue, getValues, isTax]);

  // Picker options carry each lot's live remaining (in edit mode including this invoice's own
  // pcs), so caps come from them rather than from a saved line's snapshot objects.
  const liveLots = (lots) => (lots || []).map((l) => pickerLots.find((o) => String(o._id) === String(l._id)) || l);

  // The current per-lot split for a line.
  //   Tax Invoice      → record-only split (computeTaxSources).
  //   Bill of Supply edit → the SAVED split until this line's lots/total are changed (splitDirty),
  //                         so editing another line never silently moves pcs between lots.
  //   Otherwise        → FIFO across the selected lots, capped at their live remaining.
  const lineSources = (cur) => {
    if (isTax && cur.merged) return computeTaxSources(cur.mergeLots, cur.pcs);
    if (editInvoice && cur.merged && !cur.splitDirty) return cur.sources || [];
    return computeFifoSources(liveLots(cur.mergeLots), cur.pcs);
  };

  // Band a lot option falls into. Also the Autocomplete groupBy label, so the operator sees
  // their own stock first and has to scroll past a header to reach someone else's.
  const lotGroup = (o) => (o?.isHouseLot ? 'In-house stock' : (o?.isCrossClient ? "Other clients' lots" : 'This client'));

  // Amber "belongs to X" chip. Rendered for foreign lots only — house stock is normal traffic.
  const ownerChip = (o) => (o?.isCrossClient && !o?.isHouseLot ? (
    <Chip size="small" color="warning" variant="filled" label={o.clientName || 'Other client'}
      sx={{ height: 18, '& .MuiChip-label': { px: 0.5, fontSize: '0.65rem', fontWeight: 700 } }} />
  ) : (o?.isHouseLot ? (
    <Chip size="small" color="info" variant="outlined" label={o.clientName || 'In-house'}
      sx={{ height: 18, '& .MuiChip-label': { px: 0.5, fontSize: '0.65rem' } }} />
  ) : null));

  // One lot row in the pickers: lot · maker bill, owner chip, not-finished flag, remaining pcs.
  const renderLotOption = (option) => (
    <Box>
      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
        <Typography variant="body2">
          <b>{option.lotNumber}</b>{option.invoiceNumber ? ` · Inv ${option.invoiceNumber}` : ''}
        </Typography>
        {!damagedMode && ownerChip(option)}
        {!damagedMode && option.notFinished && (
          <Chip size="small" color="warning" variant="outlined" icon={<WarningAmberIcon />}
            label="Not finished" sx={{ height: 18, '& .MuiChip-label': { px: 0.5, fontSize: '0.65rem' }, '& .MuiChip-icon': { fontSize: 14, ml: 0.5 } }} />
        )}
      </Stack>
      {!option._fallback && (
        <Typography variant="caption" color="text.secondary">
          {damagedMode
            ? `${option.clientName || ''} · ${option.fitStyleName} · ${option.damagedAvailable} damaged pcs`
            : `${option.fitStyleName} · ${option.fabric} · Remaining ${option.remainingPcs} of ${option.finalPcs} pcs`}
        </Typography>
      )}
    </Box>
  );
  const lotLabel = (o) => (o ? `${o.lotNumber || ''}${o.invoiceNumber ? ` (Inv ${o.invoiceNumber})` : ''}` : '');
  // Where the picker's search box looks — shown as its placeholder so the scope is never a surprise.
  const lotSearchPlaceholder = damagedMode
    ? 'Search damaged lots — lot no. / bill no.'
    : ((crossClient || isTax) ? 'Search ALL clients — lot no. / bill no.' : 'Search this client & in-house — lot no. / bill no.');

  // Lot picker cell shared by mobile + desktop. `options` is the single-lot list for that layout
  // (mobile passes the good/damaged pool, desktop the good pool). The merged multi-select uses the
  // good lots (pickerLots — own + in-house + whatever the search box found).
  const renderLotField = (idx, cur, options) => {
    const canCombine = !damagedMode && !!client;
    const split = lineSources(cur);
    return (
      <>
        {cur.merged ? (
          <LotSelect
            multiple
            options={pickerLots}
            value={(cur.mergeLots || []).map((l) => String(l._id))}
            selectedLots={cur.mergeLots || []}
            onChange={(lots) => changeMergeLots(idx, lots)}
            disabled={!client}
            loading={lotsLoading}
            placeholder="Pick lots to combine"
            searchPlaceholder={lotSearchPlaceholder}
            searchLots={searchLots}
            resetKey={lotSearchKey}
            groupBy={lotGroup}
            getLabel={lotLabel}
            renderOption={renderLotOption}
          />
        ) : (
          <LotSelect
            options={options}
            value={cur.lotId}
            // The line's own lot stays shown even when the list/search doesn't contain it.
            selectedLots={cur.lotId ? [{ _id: cur.lotId, lotNumber: cur.lotNumber, invoiceNumber: cur.lotInvoiceNumber }] : []}
            onChange={(lot) => handleLotChange(idx, lot)}
            disabled={!damagedMode && !client}
            loading={lotsLoading}
            placeholder={(damagedMode || client) ? 'Pick a lot' : 'Pick a client first'}
            searchPlaceholder={lotSearchPlaceholder}
            searchLots={searchLots}
            resetKey={lotSearchKey}
            groupBy={damagedMode ? undefined : lotGroup}
            getLabel={lotLabel}
            renderOption={renderLotOption}
          />
        )}

        {(() => {
          // One compact line under the picker: an amber ⚠ (only when there is something to check)
          // whose tooltip lists every warning as bullets, then the split / remaining caption.
          const caption = cur.merged
            ? ((cur.mergeLots?.length > 0 || split.length > 0)
              ? `${split.length > 0
                ? `Split: ${split.map((s) => `${s.lotNumber || s.lotId}: ${s.pcs}`).join(' · ')}`
                : 'Enter total pcs to split across the selected lots'}${!isTax && cur.mergeLots?.length > 0
                ? ` · ${sumRemaining(liveLots(cur.mergeLots))} available` : ''}`
              : '')
            : (cur.lotNumber
              ? `Lot ${cur.lotNumber} · Inv ${cur.lotInvoiceNumber}${cur.remainingPcs !== null && cur.remainingPcs !== undefined ? ` · Remaining ${cur.remainingPcs}` : ''}`
              : '');
          const billedTo = client?.name || 'this client';
          const lotList = (nums) => (nums.length > 1 ? `Lots ${nums.join(', ')} are` : `Lot ${nums[0]} is`);
          const warnings = [];
          if (!damagedMode && !isTax && cur.notFinished) {
            const unfinished = (cur.merged
              ? (cur.mergeLots || []).filter((l) => l.notFinished).map((l) => l.lotNumber)
              : [cur.lotNumber]).filter(Boolean);
            warnings.push(`${unfinished.length ? lotList(unfinished) : 'A lot on this line is'} not yet in finishing — ` +
              'dispatch is allowed, verify the pcs.');
          }
          if (!damagedMode && cur.crossClientOwner) {
            // Name the lot(s): one bullet per other-client lot, with its own client.
            const foreign = cur.merged
              ? (cur.mergeLots || []).filter((l) => l.isCrossClient && !l.isHouseLot && l.lotNumber)
              : (cur.lotNumber ? [{ lotNumber: cur.lotNumber, clientName: cur.crossClientOwner }] : []);
            if (foreign.length) {
              foreign.forEach((l) => warnings.push(
                `Lot ${l.lotNumber} was produced for ${l.clientName || cur.crossClientOwner} — billing to ${billedTo}.`
              ));
            } else {
              // Saved combined line reopened for editing: per-lot owners aren't loaded, name the line's lots.
              const nums = (cur.mergeLots || []).map((l) => l.lotNumber).filter(Boolean);
              warnings.push(`${nums.length ? `One of lots ${nums.join(', ')}` : 'A lot on this line'} was produced for ` +
                `${cur.crossClientOwner} — billing to ${billedTo}.`);
            }
            warnings.push('Add an internal note below explaining why (not printed on the invoice).');
          }
          if (!caption && !warnings.length) return null;
          return (
            <Stack direction="row" alignItems="flex-start" spacing={0.5} sx={{ mt: 0.5 }}>
              {warnings.length > 0 && (
                <Tooltip
                  arrow
                  placement="right-start"
                  enterTouchDelay={0}
                  leaveTouchDelay={5000}
                  slotProps={{ tooltip: { sx: { maxWidth: 320 } } }}
                  title={(
                    <Box>
                      <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 0.25 }}>
                        Check before saving
                      </Typography>
                      <Box component="ul" sx={{ m: 0, pl: 2 }}>
                        {warnings.map((w) => (
                          <li key={w}><Typography variant="caption">{w}</Typography></li>
                        ))}
                      </Box>
                    </Box>
                  )}
                >
                  <Box
                    component="span"
                    role="img"
                    tabIndex={0}
                    aria-label={`${warnings.length} warning${warnings.length > 1 ? 's' : ''}`}
                    sx={{ display: 'inline-flex', color: 'warning.main', cursor: 'help', flexShrink: 0, mt: '1px' }}
                  >
                    <WarningAmberIcon sx={{ fontSize: 18 }} />
                  </Box>
                </Tooltip>
              )}
              {caption && (
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>{caption}</Typography>
              )}
            </Stack>
          );
        })()}

        {!damagedMode && cur.crossClientOwner && (
          // Required for a cross-client line — one compact field; the ⚠ tooltip explains why.
          <Controller
            name={`lines.${idx}.internalNote`}
            control={control}
            render={({ field }) => (
              <TextField {...field} variant="standard" size="small" fullWidth
                placeholder={`Internal note — why ${cur.crossClientOwner}'s lot? (not printed)`}
                sx={{ mt: 0.25 }}
                slotProps={{ htmlInput: { style: { fontSize: '0.75rem' } } }}
              />
            )}
          />
        )}

        {canCombine && (
          <Button size="small" sx={{ mt: 0.5, minWidth: 0, p: 0.25, fontSize: '0.7rem' }}
            onClick={() => toggleMerge(idx, !cur.merged)}>
            {cur.merged ? 'Use single lot' : 'Combine lots'}
          </Button>
        )}
        {!damagedMode && !cur.merged && !cur.lotId && (
          <Button size="small" color="info" sx={{ mt: 0.5, ml: canCombine ? 1 : 0, minWidth: 0, p: 0.25, fontSize: '0.7rem' }}
            onClick={() => setManual(idx, true)}>
            Outside item (no lot)
          </Button>
        )}
      </>
    );
  };

  const renderLotOrSample = (idx, cur, options) => {
    if (cur.isSample) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minHeight: 32 }}>
          <Chip size="small" color="secondary" variant="outlined" label="SAMPLE"
            sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '.04em' } }} />
          <Typography variant="caption" color="text.secondary">
            {Number(cur.rate) > 0 ? 'charged · no lot · no stock effect' : 'free · no lot · enter a rate to charge'}
          </Typography>
        </Box>
      );
    }
    if (cur.isManual) {
      return (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minHeight: 32, flexWrap: 'wrap' }}>
            <Chip size="small" color="info" variant="outlined" label="OUTSIDE ITEM"
              sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '.04em' } }} />
            <Typography variant="caption" color="text.secondary">not from our lots · no stock effect</Typography>
          </Box>
          {!damagedMode && (
            <Button size="small" sx={{ mt: 0.25, minWidth: 0, p: 0.25, fontSize: '0.7rem' }}
              onClick={() => setManual(idx, false)}>
              Pick a lot instead
            </Button>
          )}
        </Box>
      );
    }
    return renderLotField(idx, cur, options);
  };

  const submitTax = (data) => {
    const built = buildTaxLines(data.lines);
    if (built.error) return showSnackbar(built.error);
    const payload = {
      date: data.date?.toISOString ? data.date.toISOString() : new Date(data.date).toISOString(),
      roundOff: Number(data.roundOff) || 0,
      transportMode: data.transportMode || '',
      vehicleNo: data.vehicleNo || '',
      ewayBillNo: data.ewayBillNo || '',
      lines: built.lines
    };
    setSubmitting(true);
    const req = editTaxInvoice
      ? apiService.taxInvoices.update(editTaxInvoice._id, payload)
      : apiService.taxInvoices.create({ ...payload, sourceInvoiceId: taxSource._id });
    return req
      .then((saved) => {
        setSubmitting(false);
        const d = saved.comparedToSource;
        const differs = d && (d.pcsDiff !== 0 || d.amountDiff !== 0);
        showSnackbar(
          (editTaxInvoice ? 'Tax Invoice updated' : `Tax Invoice ${saved.invoiceNumber} created`) +
          (differs ? ` — differs from ${d.sourceInvoiceNumber} (${d.pcsDiff >= 0 ? '+' : ''}${d.pcsDiff} pcs). Stock follows the Bill of Supply.` : ''),
          differs ? 'warning' : 'success'
        );
        onSaved(saved);
        onClose();
      })
      .catch((e) => { setSubmitting(false); showSnackbar(e); });
  };

  const onSubmit = (data) => {
    if (!data.client?._id) return showSnackbar('Please select a client');
    if (!data.lines || data.lines.length === 0) return showSnackbar('Add at least one line item');
    if (isTax) return submitTax(data);

    // Place of supply with a GST state code is mandatory — a Tax Invoice generated from this Bill
    // of Supply copies it. (HSN and GSTIN stay optional here.)
    if (!/^\d{2}$/.test(String(shownPos.stateCode || ''))) {
      return showSnackbar(`${data.client?.name || 'The client'} has no GST state code — add it to the client's address in Masters → Clients, then save again`);
    }

    // Build the line payload. Merged lines send a `sources[]` split (no top-level lotId); the
    // server re-validates each source against the lot's remaining pool.
    const outLines = [];
    for (let i = 0; i < data.lines.length; i++) {
      const l = data.lines[i];
      if (l.isSample) {
        // SAMPLE line — no lot, no stock effect. Free by default; a rate makes it a CHARGED sample,
        // saved as an ordinary priced line without a lot (billed, and taxed on a Tax Invoice).
        const pcs = parseInt(l.pcs, 10);
        const rate = Number(l.rate) || 0;
        if (!l.description || !String(l.description).trim()) return showSnackbar(`Line ${i + 1}: description is required`);
        if (!Number.isInteger(pcs) || pcs < 1) return showSnackbar(`Line ${i + 1}: enter the sample pcs`);
        if (rate < 0) return showSnackbar(`Line ${i + 1}: rate can't be negative`);
        outLines.push(rate > 0
          ? { description: l.description, remark: l.remark, hsnSac: l.hsnSac, unit: l.unit, pcs, rate, isDamaged: false }
          : {
            description: l.description,
            remark: l.remark,
            hsnSac: l.hsnSac,
            unit: l.unit,
            pcs,
            rate: 0,
            isSample: true
          });
        continue;
      }
      if (l.isManual) {
        // OUTSIDE ITEM — no lot, no stock effect; billed like any other line.
        const pcs = parseInt(l.pcs, 10);
        const rate = Number(l.rate);
        if (!l.description || !String(l.description).trim()) return showSnackbar(`Line ${i + 1}: description is required`);
        if (!Number.isInteger(pcs) || pcs < 1) return showSnackbar(`Line ${i + 1}: enter the pcs`);
        if (!Number.isFinite(rate) || rate < 0) return showSnackbar(`Line ${i + 1}: enter the rate`);
        outLines.push({
          description: l.description,
          remark: l.remark,
          internalNote: l.internalNote,
          hsnSac: l.hsnSac,
          unit: l.unit,
          pcs,
          rate,
          isDamaged: false
        });
        continue;
      }
      if (l.merged) {
        // An untouched combined line on edit keeps its saved split; a changed one is re-split.
        const isEditMerged = !!editInvoice && !l.splitDirty && Array.isArray(l.sources) && l.sources.length > 0;
        const split = isEditMerged ? l.sources : computeFifoSources(liveLots(l.mergeLots), l.pcs);
        if (!split.length) return showSnackbar(`Line ${i + 1}: pick lots and a total to combine`);
        if (!isEditMerged) {
          const total = parseInt(l.pcs, 10);
          if (!Number.isInteger(total) || total < 1) return showSnackbar(`Line ${i + 1}: enter the total pcs`);
          const allocated = split.reduce((a, s) => a + s.pcs, 0);
          if (allocated !== total) {
            return showSnackbar(`Line ${i + 1}: total ${total} exceeds ${allocated} available across the selected lots`);
          }
        }
        if (l.crossClientOwner && !String(l.internalNote || '').trim()) {
          return showSnackbar(`Line ${i + 1}: add an internal note — this line uses ${l.crossClientOwner}'s lot`);
        }
        outLines.push({
          description: l.description,
          remark: l.remark,
          internalNote: l.internalNote,
          hsnSac: l.hsnSac,
          unit: l.unit,
          rate: Number(l.rate),
          isDamaged: false,
          sources: split.map((s) => ({ lotId: s.lotId, pcs: s.pcs }))
        });
      } else {
        if (!l.lotId) {
          return showSnackbar(
            `Line ${i + 1}: pick a lot — or tap "Outside item (no lot)" for goods not made in our system`
          );
        }
        if (l.crossClientOwner && !String(l.internalNote || '').trim()) {
          return showSnackbar(`Line ${i + 1}: add an internal note — this line uses ${l.crossClientOwner}'s lot`);
        }
        outLines.push({
          lotId: l.lotId || null,
          description: l.description,
          remark: l.remark,
          internalNote: l.internalNote,
          hsnSac: l.hsnSac,
          pcs: parseInt(l.pcs, 10),
          unit: l.unit,
          rate: Number(l.rate),
          isDamaged: !!data.damagedMode
        });
      }
    }

    const payload = {
      date: data.date?.toISOString ? data.date.toISOString() : new Date(data.date).toISOString(),
      clientId: data.client._id,
      billingFirmId: data.billingFirmId || null,
      // placeOfSupply omitted on purpose — server derives from client's shipping address.
      // For edits, the snapshot is already frozen and not refreshed.
      roundOff: Number(data.roundOff) || 0,
      lines: outLines
    };

    setSubmitting(true);
    const req = editInvoice
      ? apiService.salesInvoices.updateInvoice(editInvoice._id, payload)
      : apiService.salesInvoices.createInvoice(payload);
    req
      .then((saved) => {
        setSubmitting(false);
        showSnackbar(editInvoice ? 'Invoice updated' : `Invoice ${saved.invoiceNumber} created`, 'success');
        onSaved(saved);
        onClose();
      })
      .catch((e) => {
        setSubmitting(false);
        showSnackbar(e);
      });
  };

  // react-hook-form blocks submit on an empty required field (client, description, pcs, rate)
  // WITHOUT calling onSubmit — previously nothing happened and nothing said why. Say which line.
  const onInvalid = (errors) => {
    if (errors.client) return showSnackbar('Please select a client');
    if (errors.date) return showSnackbar('Please pick a valid date');
    const idx = (errors.lines || []).findIndex(Boolean);
    if (idx >= 0) {
      const e = errors.lines[idx] || {};
      const field = e.description ? 'description' : e.pcs ? 'pcs (at least 1)' : e.rate ? 'rate' : 'missing details';
      return showSnackbar(`Line ${idx + 1}: enter the ${field}`);
    }
    return showSnackbar('Please complete the required fields');
  };

  return (
    <Modal open={open} onClose={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{
        // Match Add Stitching modal: offset by drawer on desktop, stay bounded on mobile
        ml: isMobile ? 0 : drawerWidth + 'px',
        width: isMobile ? '90%' : '85%',
        maxWidth: 1200,
        maxHeight: '85vh',
        overflowY: 'auto',
        bgcolor: 'background.paper',
        borderRadius: 2,
        boxShadow: 24,
        p: isMobile ? 2 : 4
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            {isTax
              ? (editTaxInvoice
                ? `Edit Tax Invoice ${editTaxInvoice.invoiceNumber}`
                : `Generate Tax Invoice from ${taxSource?.invoiceNumber || ''}`)
              : editInvoice
                ? `Edit Invoice ${editInvoice.invoiceNumber}`
                : (damagedMode ? 'New Combined Damaged Sale' : 'New Invoice / Dispatch')}
          </Typography>
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Box>
        {editInvoice && (editInvoice.taxInvoices || []).some((t) => t.status === 'issued') && (
          <Alert severity="info" sx={{ mb: 1.5, py: 0 }}>
            Tax Invoice {(editInvoice.taxInvoices || []).find((t) => t.status === 'issued').invoiceNumber} was
            generated from this Bill of Supply — it does not change with this edit. Edit it separately if needed.
          </Alert>
        )}

        <form
          onSubmit={handleSubmit(onSubmit, onInvalid)}
          onKeyDown={(e) => {
            // Prevent Enter inside any non-textarea input from submitting the form.
            // Allows Enter in multiline TextField (rendered as textarea) to insert newlines.
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }}
        >
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, md: 3 }}>
                <Controller
                  name="date"
                  control={control}
                  rules={{ required: 'Date is required' }}
                  render={({ field, fieldState: { error } }) => (
                    <DatePicker
                      label="Date"
                      value={field.value}
                      onChange={field.onChange}
                      format="DD/MM/YYYY"
                      slotProps={{ textField: { fullWidth: true, variant: 'standard', error: !!error, helperText: error?.message } }}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Controller
                  name="client"
                  control={control}
                  rules={{ required: 'Client is required' }}
                  render={({ field, fieldState: { error } }) => (
                    <Autocomplete
                      options={billableClients}
                      getOptionLabel={(o) => o ? `${o.name} (${o.clientCode})` : ''}
                      isOptionEqualToValue={(o, v) => o?._id === v?._id}
                      value={field.value}
                      onChange={(_, v) => field.onChange(v)}
                      disabled={!!editInvoice || isTax}
                      renderInput={(params) => (
                        <TextField {...params} label="Client" variant="standard" error={!!error} helperText={error?.message || ((editInvoice || isTax) ? 'Client locked after issue' : '')} />
                      )}
                    />
                  )}
                />
              </Grid>
              {billingFirms.length > 0 ? (
                <Grid size={{ xs: 12, md: 3 }}>
                  <Controller
                    name="billingFirmId"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        select
                        label="Billing Firm"
                        fullWidth
                        variant="standard"
                        disabled={!!editInvoice || isTax}
                        helperText={(editInvoice || isTax) ? 'Locked after issue' : 'Firm billed to on this invoice'}
                        SelectProps={{ displayEmpty: true }}
                        InputLabelProps={{ shrink: true }}
                      >
                        <MenuItem value="">
                          {selectedClientFull?.billingName || selectedClientFull?.name || 'client'}
                        </MenuItem>
                        {billingFirms.map((f) => (
                          <MenuItem key={f._id} value={String(f._id)}>{f.billingName}</MenuItem>
                        ))}
                      </TextField>
                    )}
                  />
                </Grid>
              ) : client ? (
                // No selectable sub-firms → show the firm (client's default billing identity)
                // read-only so it's still visible on the invoice form.
                <Grid size={{ xs: 12, md: 3 }}>
                  <TextField
                    label="Firm"
                    value={selectedClientFull?.billingName || selectedClientFull?.name || ''}
                    fullWidth
                    variant="standard"
                    InputProps={{ readOnly: true }}
                    InputLabelProps={{ shrink: true }}
                    helperText="Firm billed to on this invoice"
                  />
                </Grid>
              ) : null}
              <Grid size={{ xs: 6, md: 3 }}>
                <TextField
                  label="Place of Supply"
                  value={shownPos.stateName || shownPos.stateCode
                    ? `${shownPos.stateName || ''}${shownPos.stateCode ? ` (${shownPos.stateCode})` : ''}`
                    : ''}
                  fullWidth variant="standard"
                  InputProps={{ readOnly: true }}
                  error={!isTax && !!client && !shownPos.stateCode}
                  helperText={isTax
                    ? (!shownPos.stateCode
                      ? 'No state code on the Bill of Supply — edit and save it once to pick it up'
                      : (taxPreview?.preview?.supplyType === 'INTRA' ? 'Same state → CGST + SGST'
                        : (taxPreview?.preview?.supplyType === 'INTER' ? 'Other state → IGST' : '')))
                    : (!client ? 'Pick a client'
                      : (!shownPos.stateCode ? 'Required — add the GST state code in Masters → Clients'
                        : (posFromMaster ? 'Taken from the client master on save' : '')))}
                />
              </Grid>
              {isTax && (
                <>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <Controller name="transportMode" control={control}
                      render={({ field }) => <TextField {...field} label="Mode of Transport" fullWidth variant="standard" placeholder="e.g. Road / By Hand" />} />
                  </Grid>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <Controller name="vehicleNo" control={control}
                      render={({ field }) => <TextField {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} label="Vehicle No" fullWidth variant="standard" />} />
                  </Grid>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <Controller name="ewayBillNo" control={control}
                      render={({ field }) => <TextField {...field} label="E-way Bill No" fullWidth variant="standard" helperText="Optional — entered manually" />} />
                  </Grid>
                </>
              )}
              {!isTax && (
                // Rarely used, so kept compact: one row of small switches. On edit the sale type is
                // shown but locked — it decides which stock pool every line draws from.
                <Grid size={{ xs: 12 }} sx={{ mt: -1 }}>
                  <Stack direction="row" flexWrap="wrap" columnGap={3} rowGap={0}>
                    {!damagedMode && (
                      <Controller
                        name="crossClient"
                        control={control}
                        render={({ field }) => (
                          <FormControlLabel
                            sx={{ m: 0 }}
                            control={(
                              <Switch
                                size="small"
                                checked={!!field.value}
                                onChange={(e) => {
                                  // ON only widens the list, so selections stay. OFF while a line still
                                  // uses another client's lot would orphan it — refuse instead of clearing.
                                  if (!e.target.checked && (getValues('lines') || []).some((l) => l.crossClientOwner)) {
                                    showSnackbar("Remove the lines that use other clients' lots first", 'warning');
                                    return;
                                  }
                                  field.onChange(e.target.checked);
                                }}
                                color="warning"
                              />
                            )}
                            label={(
                              <Typography variant="caption">
                                Other clients&apos; lots{' '}
                                <Typography component="span" variant="caption" color="text.secondary">(search all clients · needs internal note)</Typography>
                              </Typography>
                            )}
                          />
                        )}
                      />
                    )}
                    {/* Second from the left: rarely used, and it changes which pool every line draws from. */}
                    <Controller
                      name="damagedMode"
                      control={control}
                      render={({ field }) => (
                        <FormControlLabel
                          sx={{ m: 0 }}
                          control={(
                            <Switch
                              size="small"
                              checked={!!field.value}
                              disabled={!!editInvoice}
                              onChange={(e) => {
                                field.onChange(e.target.checked);
                                // The two pools are different lists — reset every line's lot selection.
                                (getValues('lines') || []).forEach((_, i) => toggleMerge(i, false));
                              }}
                              color="warning"
                            />
                          )}
                          label={(
                            <Typography variant="caption">
                              Combined damaged sale{' '}
                              <Typography component="span" variant="caption" color="text.secondary">(third-party buyer)</Typography>
                            </Typography>
                          )}
                        />
                      )}
                    />
                  </Stack>
                </Grid>
              )}
            </Grid>
          </LocalizationProvider>

          <Divider sx={{ mt: 1, mb: 1.5 }}><Typography variant="caption">INVOICE ITEMS</Typography></Divider>

          {isMobile ? (
            // ── Mobile: stacked Cards per line ───────────────────────────
            <Stack spacing={1.5}>
              {fields.map((row, idx) => {
                const cur = lines?.[idx] || {};
                const amount = (Number(cur.pcs) || 0) * (Number(cur.rate) || 0);
                const remaining = cur.remainingPcs;
                const overshoot = !isTax && remaining !== null && remaining !== undefined && Number(cur.pcs) > remaining;
                return (
                  <Card key={row.id} variant="outlined">
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="subtitle2" fontWeight="bold">Item #{idx + 1}</Typography>
                        <IconButton size="small" onClick={() => remove(idx)} disabled={fields.length === 1}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>

                      {renderLotOrSample(idx, cur, lotOptions)}

                      <Controller
                        name={`lines.${idx}.description`}
                        control={control}
                        rules={{ required: true }}
                        render={({ field }) => (
                          <TextField {...field} label="Description" variant="standard" fullWidth multiline maxRows={3} sx={{ mt: 1.5 }} />
                        )}
                      />
                      <Controller
                        name={`lines.${idx}.remark`}
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            label="Remark (optional)"
                            variant="standard"
                            fullWidth multiline maxRows={2}
                            sx={{ mt: 1 }}
                            InputProps={{ sx: { fontSize: '0.85rem', color: 'text.secondary' } }}
                          />
                        )}
                      />

                      <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                        <Grid size={{ xs: 4 }}>
                          <Controller
                            name={`lines.${idx}.hsnSac`}
                            control={control}
                            render={({ field }) => (
                              <TextField {...field} label="HSN/SAC" variant="standard" size="small" fullWidth />
                            )}
                          />
                        </Grid>
                        <Grid size={{ xs: 4 }}>
                          <Controller
                            name={`lines.${idx}.pcs`}
                            control={control}
                            rules={{ required: true, min: 1 }}
                            render={({ field }) => (
                              <TextField
                                {...field}
                                label={cur.merged ? 'Total Pcs' : 'Pcs'}
                                type="number"
                                variant="standard"
                                size="small"
                                fullWidth
                                onChange={(e) => { field.onChange(e); if (cur.merged) setValue(`lines.${idx}.splitDirty`, true); }}
                                inputProps={{ min: 1, style: { textAlign: 'right' } }}
                                error={overshoot}
                                helperText={overshoot ? `Max ${remaining}` : ''}
                              />
                            )}
                          />
                        </Grid>
                        <Grid size={{ xs: 4 }}>
                          <Controller
                            name={`lines.${idx}.rate`}
                            control={control}
                            rules={{ required: true, min: 0 }}
                            render={({ field }) => (
                              <TextField
                                {...field}
                                label="Rate"
                                type="number"
                                variant="standard"
                                size="small"
                                fullWidth
                                helperText={cur.isSample ? (Number(cur.rate) > 0 ? 'Charged sample' : 'Free — enter a rate to charge') : ''}
                                inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right' } }}
                              />
                            )}
                          />
                        </Grid>
                      </Grid>
                      {isTax && !(cur.isSample && !(Number(cur.rate) > 0)) && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                          <Typography variant="body2">GST %</Typography>
                          {renderTaxRate(idx)}
                        </Box>
                      )}

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1.5, pt: 1, borderTop: `1px dashed ${theme.palette.divider}` }}>
                        <Typography variant="body2">Amount</Typography>
                        <Typography variant="body2" fontWeight="bold">₹ {fmtINR(amount)}</Typography>
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          ) : (
            // ── Desktop: table ───────────────────────────────────────────
            <Box sx={{ overflowX: 'auto' }}>
              {/* Fixed layout: the widths below are respected; Description takes the rest. The lot
                  column is wide enough for two selected lots side by side. */}
              <Table size="small" sx={{ tableLayout: 'fixed', minWidth: 960 }}>
                <TableHead>
                  <TableRow>
                    <TableCell width={32}>#</TableCell>
                    <TableCell width={360}>Lot # / Invoice #</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell width={84}>HSN/SAC</TableCell>
                    <TableCell width={76} align="right">Pcs</TableCell>
                    <TableCell width={88} align="right">Rate</TableCell>
                    {isTax && <TableCell width={72} align="right">GST %</TableCell>}
                    <TableCell width={112} align="right">Amount</TableCell>
                    <TableCell width={44} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fields.map((row, idx) => {
                    const cur = lines?.[idx] || {};
                    const amount = (Number(cur.pcs) || 0) * (Number(cur.rate) || 0);
                    const remaining = cur.remainingPcs;
                    const overshoot = !isTax && remaining !== null && remaining !== undefined && Number(cur.pcs) > remaining;
                    return (
                      <TableRow key={row.id}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>
                          {renderLotOrSample(idx, cur, pickerLots)}
                        </TableCell>
                        <TableCell>
                          <Controller
                            name={`lines.${idx}.description`}
                            control={control}
                            rules={{ required: true }}
                            render={({ field }) => (
                              <TextField {...field} variant="standard" fullWidth multiline maxRows={3} placeholder="Description (bold)" />
                            )}
                          />
                          <Controller
                            name={`lines.${idx}.remark`}
                            control={control}
                            render={({ field }) => (
                              <TextField
                                {...field}
                                variant="standard"
                                fullWidth multiline maxRows={2}
                                placeholder="Remark (optional)"
                                sx={{ mt: 0.5 }}
                                InputProps={{ sx: { fontSize: '0.85rem', color: 'text.secondary' } }}
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Controller
                            name={`lines.${idx}.hsnSac`}
                            control={control}
                            render={({ field }) => (
                              <TextField {...field} variant="standard" size="small" fullWidth />
                            )}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Controller
                            name={`lines.${idx}.pcs`}
                            control={control}
                            rules={{ required: true, min: 1 }}
                            render={({ field }) => (
                              <TextField
                                {...field}
                                type="number"
                                variant="standard"
                                size="small"
                                fullWidth
                                onChange={(e) => { field.onChange(e); if (cur.merged) setValue(`lines.${idx}.splitDirty`, true); }}
                                inputProps={{ min: 1, style: { textAlign: 'right' } }}
                                error={overshoot}
                                helperText={overshoot ? `Max ${remaining}` : ''}
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Controller
                            name={`lines.${idx}.rate`}
                            control={control}
                            rules={{ required: true, min: 0 }}
                            render={({ field }) => (
                              <TextField
                                {...field}
                                type="number"
                                variant="standard"
                                size="small"
                                fullWidth
                                placeholder={cur.isSample ? '0 = free' : ''}
                                inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right' } }}
                              />
                            )}
                          />
                        </TableCell>
                        {isTax && (
                          <TableCell align="right">{cur.isSample && !(Number(cur.rate) > 0) ? '—' : renderTaxRate(idx)}</TableCell>
                        )}
                        <TableCell align="right">{fmtINR(amount)}</TableCell>
                        <TableCell>
                          <IconButton size="small" onClick={() => remove(idx)} disabled={fields.length === 1}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}

          <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button startIcon={<AddIcon />} onClick={() => append({ ...emptyLine })}>
              Add Item
            </Button>
            <Button startIcon={<AddIcon />} color="secondary" onClick={() => append({ ...emptySample })}>
              Add Sample
            </Button>
            {!damagedMode && (
              <Button startIcon={<AddIcon />} color="info" onClick={() => append({ ...emptyManual })}>
                Add Outside Item
              </Button>
            )}
          </Box>

          <Grid container spacing={2} sx={{ mt: 2 }}>
            <Grid size={{ xs: 12, md: 8 }} />
            <Grid size={{ xs: 12, md: 4 }}>
              <Stack spacing={1} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">{isTax ? 'Taxable Amount' : 'Sub Total'}</Typography>
                  <Typography variant="body2">₹ {fmtINR(totals.subTotal)}</Typography>
                </Box>
                {isTax && taxPreview?.ok && (taxPreview.preview.supplyType === 'INTRA' ? (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">CGST</Typography>
                      <Typography variant="body2">₹ {fmtINR(taxPreview.preview.cgstTotal)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">SGST</Typography>
                      <Typography variant="body2">₹ {fmtINR(taxPreview.preview.sgstTotal)}</Typography>
                    </Box>
                  </>
                ) : (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">IGST</Typography>
                    <Typography variant="body2">₹ {fmtINR(taxPreview.preview.igstTotal)}</Typography>
                  </Box>
                ))}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Round Off</Typography>
                  <Controller
                    name="roundOff"
                    control={control}
                    render={({ field }) => (
                      <TextField {...field} type="number" size="small" variant="standard" inputProps={{ step: 0.01, style: { textAlign: 'right', width: 80 } }} />
                    )}
                  />
                </Box>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle1"><b>Total</b></Typography>
                  <Typography variant="subtitle1"><b>{totals.totalQty} pcs · ₹ {fmtINR(isTax && taxPreview?.ok ? taxPreview.preview.total : totals.total)}</b></Typography>
                </Box>
                {isTax && taxPreview && !taxPreview.ok && (
                  <Typography variant="caption" color="error">{taxPreview.error}</Typography>
                )}
                {isTax && taxPreview?.ok && taxPreview.comparedToSource
                  && (taxPreview.comparedToSource.pcsDiff !== 0 || taxPreview.comparedToSource.amountDiff !== 0) && (
                  <Typography variant="caption" color="warning.main">
                    Differs from {taxPreview.comparedToSource.sourceInvoiceNumber} ({taxPreview.comparedToSource.pcsDiff >= 0 ? '+' : ''}{taxPreview.comparedToSource.pcsDiff} pcs,
                    ₹ {fmtINR(taxPreview.comparedToSource.amountDiff)}). Stock and balances follow the Bill of Supply.
                  </Typography>
                )}
              </Stack>
            </Grid>
          </Grid>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3, gap: 1 }}>
            <Button onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={submitting ? <CircularProgress size={16} /> : (editInvoice ? <PublishIcon /> : <SaveIcon />)}
              disabled={submitting}
            >
              {isTax ? (editTaxInvoice ? 'Update Tax Invoice' : 'Generate Tax Invoice') : (editInvoice ? 'Update Invoice' : 'Save Invoice')}
            </Button>
          </Box>
        </form>
      </Box>
    </Modal>
  );
}

export default InvoiceFormModal;
