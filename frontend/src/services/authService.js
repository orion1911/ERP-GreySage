import axiosInstance from './axiosInstance';

const authService = {
  login: async (credentials) => {
    try {
      const response = await axiosInstance.post('api/login', credentials);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  register: async (userData) => {
    try {
      const response = await axiosInstance.post('api/register', userData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // Server-side logout — removes the refresh token row from the user's DB record
  // and clears the httpOnly cookie. Even if it fails (e.g. network down) the
  // caller should still clear localStorage and redirect, hence no throw.
  logout: async () => {
    try {
      await axiosInstance.post('api/logout');
    } catch (_) {
      // swallow — local cleanup happens regardless
    }
  },
};

export default authService;
