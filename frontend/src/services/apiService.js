import axiosInstance from './axiosInstance';

const apiService = {

  admin: {
    userMgmt: {
      getUsers: async () => {
        try {
          const response = await axiosInstance.get('api/users');
          return response.data;
        } catch (error) {
          throw error
          // throw error.response?.data || error.message;
        }
      },
      deleteUser: async (id) => {
        try {
          const response = await axiosInstance.put(`api/users/${id}`);
          return response.data;
        } catch (error) {
          throw error
        }
      }
    },
    audit: {
      getAudits: async () => {
        try {
          const response = await axiosInstance.get('api/audit-logs');
          return response.data;
        } catch (error) {
          throw error
        }
      },
    },
    report: {
      getReport: async () => {
         try {
          const response = await axiosInstance.get('api/reports');
          return response.data;
        } catch (error) {
          throw error
        }
      },
      generateReport: async (repData) => {
         try {
          const response = await axiosInstance.post('api/reports', repData);
          return response.data;
        } catch (error) {
          throw error
        }
      }
    }
  },

  // Order-related API calls
  orders: {
    createOrder: async (orderData) => {
      try {
        const response = await axiosInstance.post('api/orders', orderData);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    updateOrder: async (id, orderData) => {
      try {
        const response = await axiosInstance.post(`api/orders-update/${id}`, orderData);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    getOrders: async (search = '') => {
      try {
        const response = await axiosInstance.get('api/orders', {
          params: { search },
        });
        return response.data;
      } catch (error) {
        throw error
      }
    },

    getOrderById: async (orderId) => {
      try {
        const response = await axiosInstance.get(`api/orders/${orderId}`);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    updateOrderStatus: async (id, status) => {
      try {
        const response = await axiosInstance.put(`api/orders/${id}/status`, { status });
        return response.data;
      } catch (error) {
        throw error
      }
    },
  },

  // Stitching-related API calls
  stitching: {
    createStitching: async (stitchingData) => {
      try {
        const response = await axiosInstance.post('api/stitching', stitchingData);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    updateStitching: async (id, stitchingData) => {
      try {
        const response = await axiosInstance.post(`api/stitching-update/${id}`, stitchingData);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    updateStitchingStatus: async (stitchingData) => {
      try {
        const response = await axiosInstance.put('api/stitching', stitchingData);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    getStitching: async (search = '', orderId = '', invoiceNumber = '') => {
      try {
        const response = await axiosInstance.get('api/stitching', {
          params: { search, orderId, invoiceNumber },
        });
        return response.data;
      } catch (error) {
        throw error
        // throw error
      }
    },
  },

  // Washing-related API calls
  washing: {
    createWashing: async (washingData) => {
      try {
        const response = await axiosInstance.post('api/washing', washingData);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    updateWashing: async (id, washingData) => {
      try {
        const response = await axiosInstance.post(`api/washing-update/${id}`, washingData);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    updateWashingStatus: async (id, washOutDate) => {
      try {
        const response = await axiosInstance.put(`api/washing/${id}`, { washOutDate });
        return response.data;
      } catch (error) {
        throw error
      }
    },

    getWashing: async (search = '', lotId = '', invoiceNumber = '') => {
      try {
        const response = await axiosInstance.get('api/washing', {
          params: { search, lotId, invoiceNumber },
        });
        return response.data;
      } catch (error) {
        throw error
      }
    },
  },

  // Finishing-related API calls
  finishing: {
    createFinishing: async (finishingData) => {
      try {
        const response = await axiosInstance.post('api/finishing', finishingData);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    updateFinishing: async (id, finishOutDate) => {
      try {
        const response = await axiosInstance.put(`api/finishing/${id}`, { finishOutDate });
        return response.data;
      } catch (error) {
        throw error
      }
    },

    getFinishing: async (search = '') => {
      try {
        const response = await axiosInstance.get('api/finishing', {
          params: { search },
        });
        return response.data;
      } catch (error) {
        throw error
      }
    },
  },

  // Fabric Vendors API calls
  fabricVendors: {
    createFabricVendor: async (vendorData) => {
      try {
        const response = await axiosInstance.post('api/fabric-vendors', vendorData);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    getFabricVendors: async (search = '', showInactive = false) => {
      try {
        const response = await axiosInstance.get('api/fabric-vendors', {
          params: { search, showInactive },
        });
        return response.data;
      } catch (error) {
        throw error
      }
    },

    toggleFabricVendorActive: async (id) => {
      try {
        const response = await axiosInstance.put(`api/fabric-vendors/${id}/toggle-active`);
        return response.data;
      } catch (error) {
        throw error
      }
    },
  },

  // Stitching Vendors API calls
  stitchingVendors: {
    createStitchingVendor: async (vendorData) => {
      try {
        const response = await axiosInstance.post('api/stitching-vendors', vendorData);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    getStitchingVendors: async (search = '', showInactive = false) => {
      try {
        const response = await axiosInstance.get('api/stitching-vendors', {
          params: { search, showInactive },
        });
        return response.data;
      } catch (error) {
        throw error
      }
    },

    toggleStitchingVendorActive: async (id) => {
      try {
        const response = await axiosInstance.put(`api/stitching-vendors/${id}/toggle-active`);
        return response.data;
      } catch (error) {
        throw error
      }
    },
  },

  // Washing Vendors API calls
  washingVendors: {
    createWashingVendor: async (vendorData) => {
      try {
        const response = await axiosInstance.post('api/washing-vendors', vendorData);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    getWashingVendors: async (search = '', showInactive = false) => {
      try {
        const response = await axiosInstance.get('api/washing-vendors', {
          params: { search, showInactive },
        });
        return response.data;
      } catch (error) {
        throw error
      }
    },

    toggleWashingVendorActive: async (id) => {
      try {
        const response = await axiosInstance.put(`api/washing-vendors/${id}/toggle-active`);
        return response.data;
      } catch (error) {
        throw error
      }
    },
  },

  // Finishing Vendors API calls
  finishingVendors: {
    createFinishingVendor: async (vendorData) => {
      try {
        const response = await axiosInstance.post('api/finishing-vendors', vendorData);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    getFinishingVendors: async (search = '', showInactive = false) => {
      try {
        const response = await axiosInstance.get('api/finishing-vendors', {
          params: { search, showInactive },
        });
        return response.data;
      } catch (error) {
        throw error
      }
    },

    toggleFinishingVendorActive: async (id) => {
      try {
        const response = await axiosInstance.put(`api/finishing-vendors/${id}/toggle-active`);
        return response.data;
      } catch (error) {
        throw error
      }
    },
  },

  // Lot-related API calls
  lots: {
    searchByLotNumber: async (lotNumber, orderId) => {
      try {
        const response = await axiosInstance.get('api/lots/search/lotNumber', {
          params: { lotNumber, orderId },
        });
        return response.data;
      } catch (error) {
        throw error
      }
    },

    searchByInvoiceNumber: async (invoiceNumber, orderId) => {
      try {
        const response = await axiosInstance.get('api/lots/search/invoiceNumber', {
          params: { invoiceNumber, orderId },
        });
        return response.data;
      } catch (error) {
        throw error
      }
    },
  },

  client: {
    createClient: async (clientData) => {
      try {
        const response = await axiosInstance.post('api/clients', clientData);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    updateClient: async (id) => {
      try {
        const response = await axiosInstance.put(`api/clients/${id}/toggle-active`, null);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    getClients: async (search = '') => {
      try {
        const response = await axiosInstance.get('api/clients', {
          params: { search },
        });
        return response.data;
      } catch (error) {
        throw error
      }
    },
  },

  fitStyles: {
    createFitstyles: async (fitStyleData) => {
      try {
        const response = await axiosInstance.post('api/fitstyles', fitStyleData);
        return response.data;
      } catch (error) {
        throw error
      }
    },

    getFitstyles: async (search = '') => {
      try {
        const response = await axiosInstance.get('api/fitstyles', {
          params: { search },
        });
        return response.data;
      } catch (error) {
        throw error
      }
    },

    toggleFitstyleActive: async (id) => {
      try {
        const response = await axiosInstance.put(`api/fitstyles/${id}/toggle-active`);
        return response.data;
      } catch (error) {
        throw error
      }
    },
  }
};

export default apiService;