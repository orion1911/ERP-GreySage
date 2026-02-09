import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TextField, Button, Container, Typography, Box, MenuItem, Select, InputLabel, FormControl } from '@mui/material';
import authService from '../../services/authService';

function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'user' });
  const [errors, setErrors] = useState({ username: '', email: '', password: '' });
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: '' });
  };

  const validate = () => {
    const newErrors = { username: '', email: '', password: '' };
    let valid = true;

    if (!form.username.trim()) {
      newErrors.username = 'Username is required';
      valid = false;
    } else if (form.username.trim().length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
      valid = false;
    }

    if (!form.email.trim()) {
      newErrors.email = 'Email is required';
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Invalid email format';
      valid = false;
    }

    if (!form.password) {
      newErrors.password = 'Password is required';
      valid = false;
    } else if (form.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  const handleRegister = () => {
    if (!validate()) return;

    authService.register(form)
      .then(() => {
        navigate('/login');
      })
      .catch(err => {
        const serverError = err.response?.data?.error || 'Registration failed';
        setErrors(prev => ({ ...prev, email: serverError }));
      });
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
        error={!!errors.username}
        helperText={errors.username}
      />
      <TextField
        name="email"
        label="Email"
        value={form.email}
        onChange={handleChange}
        fullWidth
        margin="normal"
        error={!!errors.email}
        helperText={errors.email}
      />
      <TextField
        name="password"
        label="Password"
        type="password"
        value={form.password}
        onChange={handleChange}
        fullWidth
        margin="normal"
        error={!!errors.password}
        helperText={errors.password}
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
