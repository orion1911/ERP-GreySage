import React, { useState, useEffect } from 'react';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CssBaseline from '@mui/material/CssBaseline';
import FormControlLabel from '@mui/material/FormControlLabel';
import Divider from '@mui/material/Divider';
import FormLabel from '@mui/material/FormLabel';
import FormControl from '@mui/material/FormControl';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import MuiCard from '@mui/material/Card';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import InputLabel from '@mui/material/InputLabel';
import { styled } from '@mui/material/styles';
import ForgotPassword from './ForgotPassword';
import ThemeToggle from '../../components/Theme/ThemeToggle';
import { Grid } from '@mui/material';
import authService from '../../services/authService';

const Card = styled(MuiCard)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignSelf: 'center',
  width: '100%',
  padding: theme.spacing(4),
  gap: theme.spacing(3),
  margin: 'auto',
  [theme.breakpoints.up('sm')]: {
    maxWidth: '450px',
  },
  backgroundColor: theme.palette.background.paper,
  boxShadow: theme.shadows[4],
  borderRadius: theme.shape.borderRadius,
}));

const SignInContainer = styled(Stack)(({ theme }) => ({
  height: '100dvh',
  minHeight: '100%',
  padding: theme.spacing(4),
  position: 'relative',
  background: `linear-gradient(135deg, hsl(243.33deg 100% 7.06%) 0%, hsl(240deg 86.15% 25.49%) 36%, hsl(215.12deg 95.35% 33.73%) 60%, hsl(174deg 100% 45.1%) 100%)`,
  ...theme.applyStyles('dark', {
    background: `linear-gradient(135deg, hsl(243.33deg 100% 7.06%) 0%, hsl(240deg 86.15% 25.49%) 36%, hsl(215.12deg 95.35% 33.73%) 60%, hsl(174deg 100% 45.1%) 100%)`,
  }),
  ...theme.applyStyles('light', {
    background: `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.background.default} 80%)`,
  }),
}));

export default function Login({ variant, setVariant }) {
  const theme = useTheme();
  const [loading, setLoading] = React.useState(false);

  useEffect(() => {
    // const computedStyle = window.getComputedStyle(document.documentElement);
    // const textPrimaryColor = computedStyle.getPropertyValue('--template-palette-text-primary').trim();
    const colorScheme = document.documentElement.getAttribute('data-mui-color-scheme');
    console.log('Login theme:', {
      primary: theme.palette.primary.main,
      primaryDark: theme.palette.primary.dark,
      primaryLight: theme.palette.primary.light,
      mode: theme.palette.mode,
      background: theme.palette.background.default,
      text: theme.palette.text.primary,
      // computedTextPrimary: textPrimaryColor,
      colorScheme,
    });
  }, [theme]);

  const [emailError, setEmailError] = useState(false);
  const [emailErrorMessage, setEmailErrorMessage] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  function handleClick() {
    setLoading(true);
  }

  const handleClose = () => {
    setOpen(false);
  };

  const handleVariantChange = (event) => {
    console.log('Login: Changing variant to', event.target.value);
    setVariant(event.target.value);
  };

  const validateInputs = () => {
    let isValid = true;

    if (!form.email || !/\S+@\S+\.\S+/.test(form.email)) {
      setEmailError(true);
      setEmailErrorMessage('Please enter a valid email address.');
      isValid = false;
    } else {
      setEmailError(false);
      setEmailErrorMessage('');
    }

    if (!form.password || form.password.length < 6) {
      setPasswordError(true);
      setPasswordErrorMessage('Password must be at least 6 characters long.');
      isValid = false;
    } else {
      setPasswordError(false);
      setPasswordErrorMessage('');
    }

    return isValid;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (validateInputs()) {
      handleClick();
      authService.login(form)
        .then((res) => {
          localStorage.setItem('token', res.token);
          localStorage.setItem('user', JSON.stringify(res.user));
          navigate('/dashboard');
        })
        .catch((err) => { alert(err.response?.error || 'Login failed'); setLoading(false) });
    }
  };

  return (
    <>
      <CssBaseline enableColorScheme />
      <SignInContainer direction="column" justifyContent="center" data-signin="true">
        <Box
          sx={{
            position: 'fixed',
            top: '1rem',
            right: '1rem',
            display: 'flex',
            gap: 1,
            zIndex: 1200,
          }}
        >
          {/* <FormControl size="small" sx={{ minWidth: 60 }}>
            <Select
              backgroundColor="inherit"
              labelId="theme-variant-label"
              value={variant}
              onChange={handleVariantChange}
            >
              <MenuItem value="purple">Purple</MenuItem>
              <MenuItem value="earthy">Earthy</MenuItem>
              <MenuItem value="monochrome">Mono</MenuItem>
            </Select>
          </FormControl> */}
          <ThemeToggle />
        </Box>
        <Card variant="outlined" data-signin="true">
          <Typography
            component="h1"
            variant="h4"
            sx={{
              width: '100%',
              fontSize: 'clamp(2rem, 10vw, 2.15rem)',
              color: theme.palette.text.primary,
              mb: 2,
            }}
          >
            Sign in
          </Typography>
          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              gap: 3,
            }}
          >
            <FormControl>
              <FormLabel htmlFor="email" sx={{ color: theme.palette.text.primary, mb: 1 }}>
                Email
              </FormLabel>
              <TextField
                error={emailError}
                helperText={emailErrorMessage}
                id="email"
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="your@email.com"
                autoComplete="email"
                autoFocus
                required
                fullWidth
                variant="outlined"
                color={emailError ? 'error' : 'primary'}
              // sx={{
              //   '& .MuiInputBase-input': {
              //     color: theme.palette.text.primary,
              //   },
              //   '& .MuiOutlinedInput-notchedOutline': {
              //     borderColor: theme.palette.divider,
              //   },
              //   '&:hover .MuiOutlinedInput-notchedOutline': {
              //     borderColor: theme.palette.text.secondary,
              //   },
              // }}
              />
            </FormControl>
            <FormControl>
              <FormLabel htmlFor="password" sx={{ color: theme.palette.text.primary, mb: 1 }}>
                Password
              </FormLabel>
              <TextField
                error={passwordError}
                helperText={passwordErrorMessage}
                id="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="••••••"
                type="password"
                autoComplete="current-password"
                required
                fullWidth
                variant="outlined"
                color={passwordError ? 'error' : 'primary'}
              // sx={{
              //   '& .MuiInputBase-input': {
              //     color: theme.palette.text.primary,
              //   },
              //   '& .MuiOutlinedInput-notchedOutline': {
              //     borderColor: theme.palette.divider,
              //   },
              //   '&:hover .MuiOutlinedInput-notchedOutline': {
              //     borderColor: theme.palette.text.secondary,
              //   },
              // }}
              />
            </FormControl>
            <FormControlLabel
              control={<Checkbox sx={{ mt: 0, mb: 0 }} value="remember" color="primary" />}
              label="Remember me"
              sx={{ color: theme.palette.text.primary }}
            />
            <ForgotPassword open={open} handleClose={handleClose} />
            <Button type="submit" fullWidth variant="contained" size='medium' loading={loading} loadingPosition="end">
              Sign in
            </Button>

          </Box>
          {/*<Grid container spacing={2}>
            <Grid item size={{ xs: 12, sm: 6 }}>
              <Typography sx={{ color: theme.palette.text.primary }} textAlign={{ xs: 'center', sm: 'start', md: 'start' }}>
                <Link href="/register" variant="body2" sx={{ color: theme.palette.primary.main }}>
                  Register
                </Link>
              </Typography>
            </Grid>
            <Grid item size={{ xs: 12, sm: 6 }}>
              <Typography sx={{ color: theme.palette.text.primary }} textAlign={{ xs: 'center', sm: 'end', md: 'end' }}>
                <Link href="/register" variant="body2" sx={{ color: theme.palette.primary.main }}>
                  Forgot your password?
                </Link>
              </Typography>
            </Grid>
          </Grid>*/}
          {/* <Divider sx={{ my: 0, color: theme.palette.text.secondary }}>or</Divider>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography sx={{ textAlign: 'center', color: theme.palette.text.primary }}>
              Don't have an account?{' '}
              <Link href="/register" variant="body2" sx={{ color: theme.palette.primary.main }}>
                Sign up
              </Link>
            </Typography>
          </Box> */}
        </Card>
      </SignInContainer>
    </>
  );
}