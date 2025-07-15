import { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableRow, TextField, Button, Container, Typography, Box } from '@mui/material';
import apiService from '../../services/apiService';
import * as XLSX from 'xlsx';

function Reports() {
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState({ period: 'January 2025' });

  useEffect(() => {
    apiService.admin.report.getReport()
      .then(res => setReports(res));
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleGenerateReport = () => {
    apiService.admin.report.generateReport(form)
      .then(res => {
        setReports(res);
        setForm({ period: 'January 2025' });
      });
  };

  const handleExport = (report) => {
    const data = [
      { 'Total Sales': report.totalSales, 'Total Payments': report.totalPayments, 'Outstanding Balance': report.outstandingBalance },
      ...report.topDesigns.map(d => ({ Design: d.design, Pieces: d.pieces, Amount: d.amount }))
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `report_${report.period}.xlsx`);
  };

  return (
    <>
      <Typography variant="h4" gutterBottom>Reports</Typography>
      <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2, mb: 2 }}>
        <Typography variant="h6">Generate Report</Typography>
        <TextField
          name="period"
          label="Period"
          value={form.period}
          onChange={handleChange}
          fullWidth
          margin="normal"
        />
        <Button variant="contained" onClick={handleGenerateReport} sx={{ mt: 2 }}>
          Generate Report
        </Button>
      </Box>
      {reports.map(r => (
        <Box key={r._id} sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2, mb: 2 }}>
          <Typography variant="h6">Report for {r.period}</Typography>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Total Sales</TableCell>
                <TableCell>Total Payments</TableCell>
                <TableCell>Outstanding Balance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>{r.totalSales}</TableCell>
                <TableCell>{r.totalPayments}</TableCell>
                <TableCell>{r.outstandingBalance}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <Typography variant="subtitle1" sx={{ mt: 2 }}>Top Designs</Typography>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Pieces</TableCell>
                <TableCell>Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {r.topFitStyles.map((d, i) => (
                <TableRow key={i}>
                  <TableCell>{d.name}</TableCell>
                  <TableCell>{d.pieces}</TableCell>
                  <TableCell>{d.amount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button variant="contained" onClick={() => handleExport(r)} sx={{ mt: 2 }}>
            Export to Excel
          </Button>
        </Box>
      ))}
    </>
  );
}

export default Reports;