import { TableCell, TableRow, Table, TableBody, Skeleton, Box, Stack, Grid, Card, CardContent, Chip, Paper, Typography } from '@mui/material';

export const TableRowsLoader = ({ colsNum, rowsNum }) => {
    return [...Array(rowsNum)].map((row, index) => (
        <TableRow key={index}>
            {[...Array(colsNum)].map((col, idx) => {
                return (
                    <TableCell key={idx}>
                        <Skeleton animation="wave" variant="text" />
                    </TableCell>)
            })}
        </TableRow>
    ));
};

export const NoRecordRow = () => {
    return (
        <TableRow>
            <TableCell colSpan='12' sx={{ width: 155 }}>No Record Found</TableCell>
        </TableRow>
    )
}

export const CardSkeleton = ({ numOfCards }) => {
    return [...Array(numOfCards)].map((row, index) => (
        <Card key={index} variant="outlined" sx={{ flexGrow: 1 }}>
            <CardContent>
                <Skeleton animation="wave" variant="rectangular" />
            </CardContent>
        </Card>
    ));
}

export const StatCardSkeleton = ({ numOfCards }) => {
    return [...Array(numOfCards)].map((row, index) => (
        <Grid key={index} size={{ xs: 6, sm: 6, lg: 4 }}>
            <Card variant="outlined" sx={{ flexGrow: 1 }}>
                <CardContent>
                    <Typography component="h2" variant="subtitle2" gutterBottom>
                        <Skeleton animation="wave" variant="text" width="60%" />
                    </Typography>
                    <Stack
                        direction="column"
                        sx={{ justifyContent: 'space-between', flexGrow: '1', gap: 1 }}
                    >
                        <Stack sx={{ justifyContent: 'space-between' }}>
                            <Stack
                                direction="row"
                                sx={{ justifyContent: 'space-between', alignItems: 'center' }}
                            >
                                <Typography variant="h4" component="p">
                                    <Skeleton animation="wave" variant="text" width="40%" />
                                </Typography>
                                <Chip
                                    size="small"
                                    label={<Skeleton animation="wave" variant="text" width={40} />}
                                />
                            </Stack>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                <Skeleton animation="wave" variant="text" width="80%" />
                            </Typography>
                        </Stack>
                        <Box sx={{ width: '100%', height: 50 }}>
                            <Skeleton animation="wave" variant="rectangular" height={50} />
                        </Box>
                    </Stack>
                </CardContent>
            </Card>
        </Grid>
    ));
}

export const TotalQtyByClientBarSkeleton = () => {
    return (
        <Card variant="outlined">
            <CardContent>
                <Typography component="h2" variant="subtitle2" gutterBottom>
                    <Skeleton animation="wave" variant="text" width="60%" />
                </Typography>
                <Box sx={{ float: 'right', mb: 2 }}>
                    <Skeleton animation="wave" variant="text" width={100} height={32} />
                </Box>
                <Stack sx={{ justifyContent: 'space-between' }}>
                    <Stack
                        direction="row"
                        sx={{
                            alignItems: 'center',
                            gap: 1,
                        }}
                    >
                        <Typography variant="h4" component="p">
                            <Skeleton animation="wave" variant="text" width="40%" />
                        </Typography>
                        <Chip
                            size="small"
                            label={<Skeleton animation="wave" variant="text" width={40} />}
                        />
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        <Skeleton animation="wave" variant="text" width="80%" />
                    </Typography>
                </Stack>
                <Skeleton animation="wave" variant="rectangular" height={250} sx={{ mt: 2 }} />
            </CardContent>
        </Card>
    );
}

// ─── Mobile card skeletons ───────────────────────────────────────────────────────────────
// One generic shell that mirrors the real *Sx cards: `Card variant="outlined"` with
// `pt: 1, mb: 2, boxShadow: 1` (Stitching uses `p: 1.3`) and a CardContent whose bottom
// padding matches the data cards. Everything inside is FLUID — the old per-type skeletons used
// fixed pixel widths (180 / 150 / 100) inside xs=4 columns, which overflowed on phones and
// made the placeholder wider and taller than the card that replaced it, so the list jumped
// when data arrived. Labels are real text so the skeleton has the card's exact line-height.
const MobileCardSkeleton = ({ fields = [], cols = 3, chip = false, action = true, footer = false, cardSx }) => (
  <Card variant="outlined" sx={{ pt: 1, mb: 2, boxShadow: 1, ...cardSx }}>
    <CardContent sx={{ '&:last-child': { pb: 2 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle1" fontWeight="bold" sx={{ flex: 1, minWidth: 0 }}>
          <Skeleton animation="wave" variant="text" width="55%" />
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0, ml: 1 }}>
          {chip && <Skeleton animation="wave" variant="rounded" width={64} height={22} />}
          {action && <Skeleton animation="wave" variant="circular" width={28} height={28} />}
        </Stack>
      </Stack>
      {fields.length > 0 && (
        <Grid container spacing={1} sx={{ mt: 1 }}>
          {fields.map((label, i) => (
            <Grid key={i} size={{ xs: 12 / cols }} sx={{ textAlign: 'left', minWidth: 0 }}>
              <Typography variant="body2" component="div">
                <strong>{label}</strong>
                <Skeleton animation="wave" variant="text" width="85%" />
              </Typography>
            </Grid>
          ))}
        </Grid>
      )}
      {footer && (
        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
          <Skeleton animation="wave" variant="text" width="22%" />
          <Skeleton animation="wave" variant="text" width="18%" />
          <Skeleton animation="wave" variant="text" width="20%" />
        </Stack>
      )}
    </CardContent>
  </Card>
);

// Field sets per list, matching each *Sx card's columns.
const CARD_TYPES = {
  order:       { fields: ['Date', 'Client', 'Fit Style'], cols: 3, chip: true },
  stitching:   { fields: ['Date', 'Vendor', 'Quantity'], cols: 3, cardSx: { p: 1.3 } },
  washing:     { fields: ['Date', 'Vendor', 'Wash Out'], cols: 3 },
  finishing:   { fields: ['Date', 'Vendor', 'Quantity'], cols: 3 },
  client:      { fields: ['Client Code', 'Contact'], cols: 2, chip: true },
  vendor:      { fields: [], action: true },                       // name + action buttons only
  cuttingbook: { fields: ['Client', 'Fabric', 'Vendor', 'Master'], cols: 2, chip: true, footer: true },
  item:        { fields: ['Open', 'In', 'Out', 'Avail'], cols: 4 }, // stock masters (accessory items)
};

export const OrderCardSkeleton = () => <MobileCardSkeleton {...CARD_TYPES.order} />;
export const StitchingCardSkeleton = () => <MobileCardSkeleton {...CARD_TYPES.stitching} />;
export const WashingCardSkeleton = () => <MobileCardSkeleton {...CARD_TYPES.washing} />;

// Unknown types fall back to the order card, so callers never render nothing.
export const OrderCardsLoader = ({ numOfCards = 3, type = 'order' }) => {
  const cfg = CARD_TYPES[type] || CARD_TYPES.order;
  return [...Array(numOfCards)].map((_, index) => <MobileCardSkeleton key={index} {...cfg} />);
};

// ─── Stock Management ────────────────────────────────────────────────────────────────────

// Table-shaped loader for the ledger panels (Purchases / Payments) — sits inside their
// fixed-height TableContainer on both desktop and mobile (the real tables scroll there too).
export const LedgerTableSkeleton = ({ cols = 6, rows = 6 }) => (
  <Table size="small">
    <TableBody>
      <TableRowsLoader colsNum={cols} rowsNum={rows} />
    </TableBody>
  </Table>
);

// Whole-page placeholder for Stock Management's initial load: title → view toggle + filter →
// stat cards (one per article type) → type tabs → ledger. Card geometry copies the real
// stat cards (`flex: 1 1 175px`, `minWidth 160`, `CardContent p: 1.75`) so nothing shifts
// when the data lands.
export const StockPageSkeleton = ({ isMobile = false, statCards = 4 }) => (
  <Box sx={{ pb: { xs: 10, md: 4 } }}>
    <Typography variant="h4" sx={{ mb: 1 }}>
      <Skeleton animation="wave" variant="text" width={isMobile ? '70%' : 300} />
    </Typography>
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
      <Skeleton animation="wave" variant="rounded" width={isMobile ? '100%' : 300} height={32} />
      <Skeleton animation="wave" variant="text" width={170} height={32} />
    </Stack>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
      {[...Array(statCards)].map((_, i) => (
        <Card key={i} variant="outlined" sx={{ flex: '1 1 175px', minWidth: 160 }}>
          <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 0.5 }}>
              <Typography variant="overline" sx={{ flex: 1, lineHeight: 1.4 }}>
                <Skeleton animation="wave" variant="text" width="60%" />
              </Typography>
              <Skeleton animation="wave" variant="rounded" width={34} height={34} sx={{ ml: 1, flexShrink: 0 }} />
            </Stack>
            <Typography variant="h4" sx={{ lineHeight: 1.1 }}>
              <Skeleton animation="wave" variant="text" width="50%" />
            </Typography>
            <Typography variant="caption" component="div">
              <Skeleton animation="wave" variant="text" width="65%" />
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ mt: 1.25 }}>
              <Skeleton animation="wave" variant="text" width="30%" />
              <Skeleton animation="wave" variant="text" width="30%" />
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Box>
    <Paper sx={{ mb: 2, px: 2, py: 1.5 }}>
      <Stack direction="row" spacing={3}>
        {[...Array(isMobile ? 3 : 5)].map((_, i) => (
          <Skeleton key={i} animation="wave" variant="text" width={isMobile ? '30%' : 90} height={28} />
        ))}
      </Stack>
    </Paper>
    <Skeleton animation="wave" variant="rounded" width={isMobile ? '100%' : 220} height={32} sx={{ mb: 2 }} />
    <Paper sx={{ p: { xs: 1.5, md: 2 }, mb: 2 }}>
      <Grid container spacing={2}>
        {[...Array(3)].map((_, i) => (
          <Grid key={i} size={{ xs: 4 }}>
            <Typography variant="caption" component="div">
              <Skeleton animation="wave" variant="text" width="70%" />
            </Typography>
            <Typography variant="h6" component="div">
              <Skeleton animation="wave" variant="text" width="55%" />
            </Typography>
          </Grid>
        ))}
      </Grid>
    </Paper>
    <Grid container spacing={2}>
      {[...Array(isMobile ? 1 : 2)].map((_, i) => (
        <Grid key={i} size={{ xs: 12, md: 6 }}>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
            <Skeleton animation="wave" variant="text" width={120} />
          </Typography>
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <LedgerTableSkeleton cols={isMobile ? 4 : 6} rows={6} />
          </Paper>
        </Grid>
      ))}
    </Grid>
  </Box>
);

// Finishing Vendor Extras: caption line, then one collapsed accordion row per vendor.
export const ExtrasPageSkeleton = ({ isMobile = false, vendors = 3 }) => (
  <Box>
    <Typography variant="caption" component="div" sx={{ mb: 2 }}>
      <Skeleton animation="wave" variant="text" width={isMobile ? '90%' : 480} />
    </Typography>
    {[...Array(vendors)].map((_, i) => (
      <Paper key={i} variant="outlined" sx={{ mb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.5 }}>
          <Skeleton animation="wave" variant="text" width={isMobile ? '45%' : 220} height={28} />
          <Stack direction="row" spacing={1} alignItems="center">
            <Skeleton animation="wave" variant="rounded" width={72} height={22} />
            <Skeleton animation="wave" variant="circular" width={24} height={24} />
          </Stack>
        </Stack>
      </Paper>
    ))}
  </Box>
);
