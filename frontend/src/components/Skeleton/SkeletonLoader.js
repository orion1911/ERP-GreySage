import { TableCell, TableRow, Skeleton, Box, Stack, Grid, Card, CardContent, Chip, IconButton, Typography, useTheme } from '@mui/material';

export const TableRowsLoader = ({ colsNum, rowsNum }) => {
    return [...Array(rowsNum)].map((row, index) => (
        <TableRow key={index}>
            {[...Array(colsNum)].map((col, idx) => {
                return (
                    <TableCell>
                        <Skeleton animation="wave" variant="text" />
                    </TableCell>)
            })}
        </TableRow>
    ));
};

export const NoRecordRow = () => {
    return (
        <TableRow>
            <TableCell sx={{ width: 155 }}>No Record Found</TableCell>
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

export const OrderCardSkeleton = () => {
    const theme = useTheme();

    return (
        <Card variant="outlined" sx={{ pt: 1, mb: 2, boxShadow: 1, backgroundColor: `${theme.palette.background.paper} !important` }}>
            <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1" fontWeight="bold">
                        <Skeleton animation="wave" variant="text" width={180} />
                    </Typography>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                        <Chip
                            size="small"
                            label={<Skeleton animation="wave" variant="text" width={60} />}
                            sx={{ ml: 1, p: 1.5 }}
                        />
                    </Typography>
                    <IconButton size="small">
                        <Skeleton animation="wave" variant="circular" width={24} height={24} />
                    </IconButton>
                </Stack>
                <Stack spacing={1} sx={{ mt: 1 }}>
                    <Typography variant="body2">
                        <strong>Client:   </strong> <Skeleton animation="wave" variant="text" width={100} sx={{ display: 'inline-flex', ml: 1 }} />
                    </Typography>
                    <Typography variant="body2">
                        <strong>Quantity:  </strong> <Skeleton animation="wave" variant="text" width={60} sx={{ display: 'inline-flex', ml: 1 }} />
                    </Typography>
                </Stack>
            </CardContent>
        </Card>
    );
};

export const OrderCardsLoader = ({ numOfCards = 3 }) => {
    return [...Array(numOfCards)].map((_, index) => (
        <OrderCardSkeleton key={index} />
    ));
};