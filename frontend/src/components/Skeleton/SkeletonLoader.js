import { TableCell, TableRow, Skeleton, Box, Stack, Grid, Card, CardContent, Chip, Typography } from '@mui/material';

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