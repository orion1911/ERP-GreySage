import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TextField, Button, Container, Typography, Box, MenuItem, Select, InputLabel, FormControl } from '@mui/material';
import authService from '../../services/authService';

function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'user' });
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleRegister = () => {
    authService.register(form)
      .then(() => {
        alert('Registration successful! Please login.');
        navigate('/login');
      })
      .catch(err => alert(err.response.data.error));
  };

  return (
    <Box sx={{ mt: 8, p: 4, bgcolor: 'background.paper', borderRadius: 2, boxShadow: 3 }}>
      <Typography variant="h4" gutterBottom>Register</Typography>
      <TextField
        name="username"
        label="Username"
        value={form.username}
        onChange={handleChange}
        fullWidth
        margin="normal"
      />
      <TextField
        name="email"
        label="Email"
        value={form.email}
        onChange={handleChange}
        fullWidth
        margin="normal"
      />
      <TextField
        name="password"
        label="Password"
        type="password"
        value={form.password}
        onChange={handleChange}
        fullWidth
        margin="normal"
      />
      <FormControl fullWidth margin="normal">
        <InputLabel>Role</InputLabel>
        <Select name="role" value={form.role} onChange={handleChange}>
          <MenuItem value="user">User</MenuItem>
          <MenuItem value="admin">Admin</MenuItem>
        </Select>
      </FormControl>
      <Button variant="contained" onClick={handleRegister} fullWidth sx={{ mt: 2 }}>
        Register
      </Button>
      <Typography sx={{ mt: 2 }}>
        Already have an account? <a href="/login">Login</a>
      </Typography>
    </Box>
  );
}

export default Register;