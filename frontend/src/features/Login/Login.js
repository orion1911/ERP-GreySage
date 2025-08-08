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

const SignInContainer = styled(Box)(({ theme }) => ({
  minHeight: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: theme.spacing(2),
  overflowX: 'hidden',
  overflowY: 'auto',
  // background: `linear-gradient(135deg, hsl(243.33deg 100% 7.06%) 0%, hsl(240deg 86.15% 25.49%) 36%, hsl(215.12deg 95.35% 33.73%) 60%, hsl(174deg 100% 45.1%) 100%)`,
  // ...theme.applyStyles('dark', {
  //   background: `linear-gradient(135deg, hsl(243.33deg 100% 7.06%) 0%, hsl(240deg 86.15% 25.49%) 36%, hsl(215.12deg 95.35% 33.73%) 60%, hsl(174deg 100% 45.1%) 100%)`,
  // }),
  // ...theme.applyStyles('light', {
  //   background: `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.background.default} 80%)`,
  // }),
}));

export default function Login({ isMobile, variant, setVariant }) {
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
        {/* <Box
          sx={{
            position: 'fixed',
            top: '1rem',
            right: '1rem',
            display: 'flex',
            gap: 1,
            zIndex: 1200,
          }}
        >
          <ThemeToggle />
        </Box> */}
        <Card variant="outlined" data-signin="true" className="glass-container"
          sx={{
            // width: isMobile ? '90%' : '28%',
            width: 'clamp(300px, 90vw, 400px)',
            maxHeight: '90vh',
            overflowY: 'auto',
            mx: 'auto',
            pb: 2
          }}
        >
          <Typography
            // component="h1"
            variant="h1"
            sx={{
              fontSize: 'clamp(1.70rem, 5vw, 2rem)',
              color: theme.palette.primary.contrastText,
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
              {/* <FormLabel htmlFor="email" sx={{ color: theme.palette.primary.contrastText, mb: 1 }}>
                Email
              </FormLabel> */}
              <TextField
                error={emailError}
                helperText={emailErrorMessage}
                id="email"
                label="Email"
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="your@email.com"
                autoComplete="email"
                autoFocus
                required
                fullWidth
                variant="standard"
                color={emailError ? 'error' : theme.palette.primary.contrastText}
                sx={{
                  '& .MuiFormLabel-root': {
                    color: `${theme.palette.primary.contrastText} !important`,
                  },
                  '& .MuiInputBase-input': {
                    color: theme.palette.primary.contrastText,
                  },
                  '& .MuiInput-underline:before': {
                    borderBottomColor: theme.palette.divider,
                  },
                  // '&:hover .MuiInput-underline:before': {
                  //   borderBottomColor: theme.palette.primary.contrastText,
                  // },
                }}
              />
            </FormControl>
            <FormControl>
              <TextField
                error={passwordError}
                helperText={passwordErrorMessage}
                label="Password"
                id="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="••••••"
                type="password"
                autoComplete="current-password"
                required
                fullWidth
                variant="standard"
                color={passwordError ? 'error' : theme.palette.primary.contrastText}
                sx={{
                  '& .MuiFormLabel-root': {
                    color: `${theme.palette.primary.contrastText} !important`,
                  },
                  '& .MuiInputBase-input': {
                    color: theme.palette.primary.contrastText,
                  },
                  '& .MuiInput-underline:before': {
                    borderBottomColor: theme.palette.divider,
                  },
                  // '&:hover .MuiInput-underline:before': {
                  //   borderBottomColor: theme.palette.primary.contrastText,
                  // },
                }}
              />
            </FormControl>
            {/* <FormControlLabel
              control={<Checkbox sx={{
                mt: 1, mb: 1, '& .MuiFormLabel-root': {
                  color: `${theme.palette.primary.contrastText} !important`,
                },
              }} value="remember" />}
              label="Remember me"
            /> */}
            {/* <FormLabel sx={{ color: theme.palette.primary.contrastText, mb: 1 }}>
              Email
            </FormLabel> */}
            
            <ForgotPassword open={open} handleClose={handleClose} />
            <Button type="submit" fullWidth variant="contained" size='medium' loading={loading} loadingPosition="end"
              sx={{ mt: 1, mb: 1 }}
            >
              Sign in
            </Button>
            
          </Box>
          <Typography variant="caption" sx={{ mb: 1, color: theme.palette.primary.contrastText, textAlign: 'center' }}>
              {'© '}
              <Link color={theme.palette.primary.contrastText}>
                GREYSAGE
              </Link>
              &nbsp;
              {new Date().getFullYear()}
            </Typography>
        </Card>
      </SignInContainer>
    </>
  );
}