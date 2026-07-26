import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TextField, Button, Container, Typography, Box, MenuItem, Select, InputLabel, FormControl } from '@mui/material';
import authService from '../../services/authService';
import ThreeBackground from './ThreeBackground';

// NOTE: this page is now mounted INSIDE AdminLayout (see App.js) and the matching
// POST /api/register endpoint requires an authenticated admin. It used to be a public
// route whose Role dropdown let any visitor create themselves an Admin account.
// The dropdown is fine to keep now that only an administrator can reach the page —
// the server whitelists `role` regardless and never trusts what the client sends.
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
    } else if (form.password.length < 8) {
      // Must match MIN_PASSWORD_LENGTH in backend/controllers/authController.js
      newErrors.password = 'Password must be at least 8 characters';
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  const handleRegister = () => {
    if (!validate()) return;

    authService.register(form)
      .then(() => {
        // The admin creating the account stays signed in — send them back to the
        // user list, not to /login (which used to be the destination when this was
        // a public self-service signup page).
        navigate('/users');
      })
      .catch(err => {
        const serverError = err.response?.data?.error || 'Registration failed';
        setErrors(prev => ({ ...prev, email: serverError }));
      });
  };

  return (
    <>
      <ThreeBackground />
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
    </>
  );
}

export default Register;
