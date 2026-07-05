import axiosInstance from './axiosInstance';

const apiService = {
  admin: {
    dashboard: {
      getOrderStats: async (params) => {
        try {
          const response = await axiosInstance.get('api/dashboard/orders/status', {
            params,
          });
          return response.data;
        } catch (error) {
          throw error;
        }
      },

      getAllClientStats: async (params) => {
        try {
          const response = await axiosInstance.get('api/dashboard/orders/status-summary-clients', {
            params,
          });
          return response.data;
        } catch (error) {
          throw error;
        }
      },

      getProductionStats: async (params) => {
        try {
          const response = await axiosInstance.get('api/dashboard/production/stages', {
            params,
          });
          return response.data;
        } catch (error) {
          throw error;
        }
      },

      getProductionDashboard: async (params) => {
        try {
          const response = await axiosInstance.get('api/dashboard/production-summary', { params });
          return response.data;
        } catch (error) {
          throw error;
        }
      },

      getOrderStatusSummary: async (params) => {
        try {
          const response = await axiosInstance.get('api/dashboard/orders/status-summary', {
            params,
          });
          return response.data;
        } catch (error) {
          throw error;
        }
      },
    },

    userMgmt: {
      getUsers: async () => {
        try {
          const response = await axiosInstance.get('api/users');
          return response.data;
        } catch (error) {
          throw error;
        }
      },
      deleteUser: async (id) => {
        try {
          const response = await axiosInstance.put(`api/users/${id}`);
          return response.data;
        } catch (error) {
          throw error;
        }
      },
    },

    audit: {
      getAudits: async () => {
        try {
          const response = await axiosInstance.get('api/audit-logs');
          return response.data;
        } catch (error) {
          throw error;
        }
      },
    },

    report: {
      getReport: async () => {
        try {
          const response = await axiosInstance.get('api/reports');
          return response.data;
        } catch (error) {
          throw error;
        }
      },
      generateReport: async (repData) => {
        try {
          const response = await axiosInstance.post('api/reports', repData);
          return response.data;
        } catch (error) {
          throw error;
        }
      },
    },
  },

  // Order-related API calls
  orders: {
    createOrder: async (orderData) => {
      try {
        const response = await axiosInstance.post('api/orders', orderData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    updateOrder: async (id, orderData) => {
      try {
        const response = await axiosInstance.post(`api/orders-update/${id}`, orderData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    getOrders: async (search = '') => {
      try {
        const response = await axiosInstance.get('api/orders', {
          params: { search },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    getOrderById: async (orderId) => {
      try {
        const response = await axiosInstance.get(`api/orders/${orderId}`);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    updateOrderStatus: async (id, status) => {
      try {
        const response = await axiosInstance.put(`api/orders/${id}/status`, { status });
        return response.data;
      } catch (error) {
        throw error;
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
        throw error;
      }
    },

    updateStitching: async (id, stitchingData) => {
      try {
        const response = await axiosInstance.post(`api/stitching-update/${id}`, stitchingData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    updateStitchingStatus: async (id, stitchOutDate) => {
      try {
        const response = await axiosInstance.put(`api/stitching/${id}`, { stitchOutDate });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    getStitching: async (search = '', invoiceNumber = '') => {
      try {
        const response = await axiosInstance.get('api/stitching', {
          params: { search, invoiceNumber },
        });
        return response.data;
      } catch (error) {
        throw error;
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
        throw error;
      }
    },

    updateWashing: async (id, washingData) => {
      try {
        const response = await axiosInstance.post(`api/washing-update/${id}`, washingData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    updateWashingStatus: async (id, washOutDate) => {
      try {
        const response = await axiosInstance.put(`api/washing/${id}`, { washOutDate });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    getWashing: async (search = '', lotId = '', invoiceNumber = '') => {
      try {
        const response = await axiosInstance.get('api/washing', {
          params: { search, lotId, invoiceNumber },
        });
        return response.data;
      } catch (error) {
        throw error;
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
        throw error;
      }
    },

    updateFinishing: async (id, finishingData) => {
      try {
        const response = await axiosInstance.post(`api/finishing-update/${id}`, finishingData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    updateFinishingStatus: async (id, finishOutDate) => {
      try {
        const response = await axiosInstance.put(`api/finishing/${id}`, { finishOutDate });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    getFinishing: async (search = '', lotId = '', invoiceNumber = '') => {
      try {
        const response = await axiosInstance.get('api/finishing', {
          params: { search, lotId, invoiceNumber },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },
  },

  // Vendor Payments API calls
  vendorPayments: {
    getVendorsByType: async (vendorType) => {
      try {
        const response = await axiosInstance.get('api/vendors-by-type', {
          params: { vendorType },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    getVendorLotsDetails: async (vendorId, vendorType) => {
      try {
        const response = await axiosInstance.get('api/vendor-lots-details', {
          params: { vendorId, vendorType },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    addVendorPayment: async (payload) => {
      try {
        const response = await axiosInstance.post('api/vendor-payment', payload);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    addShortAdjustment: async (payload) => {
      try {
        const response = await axiosInstance.post('api/short-adjustment', payload);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    getVendorPaymentEntries: async (vendorId, vendorType) => {
      try {
        const response = await axiosInstance.get('api/vendor-payment-entries', {
          params: { vendorId, vendorType },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    getVendorBalanceSummary: async (vendorId, vendorType) => {
      try {
        const response = await axiosInstance.get('api/vendor-balance-summary', {
          params: { vendorId, vendorType },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    updatePaymentEntry: async (entryId, payload) => {
      try {
        const response = await axiosInstance.put(`api/vendor-payment/${entryId}`, payload);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    deletePaymentEntry: async (entryId) => {
      try {
        const response = await axiosInstance.delete(`api/vendor-payment/${entryId}`);
        return response.data;
      } catch (error) {
        throw error;
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
        throw error;
      }
    },

    getFabricVendors: async (search = '', showInactive = false) => {
      try {
        const response = await axiosInstance.get('api/fabric-vendors', {
          params: { search, showInactive },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    toggleFabricVendorActive: async (id) => {
      try {
        const response = await axiosInstance.put(`api/fabric-vendors/${id}/toggle-active`);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    reorderFabricVendors: async (orderedIds) => {
      try {
        const response = await axiosInstance.patch('api/fabric-vendors/reorder', { order: orderedIds });
        return response.data;
      } catch (error) {
        throw error;
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
        throw error;
      }
    },

    getStitchingVendors: async (search = '', showInactive = false) => {
      try {
        const response = await axiosInstance.get('api/stitching-vendors', {
          params: { search, showInactive },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    toggleStitchingVendorActive: async (id) => {
      try {
        const response = await axiosInstance.put(`api/stitching-vendors/${id}/toggle-active`);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    updateStitchingVendor: async (id, vendorData) => {
      try {
        const response = await axiosInstance.patch(`api/stitching-vendors/${id}`, vendorData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    reorderStitchingVendors: async (orderedIds) => {
      try {
        const response = await axiosInstance.patch('api/stitching-vendors/reorder', { order: orderedIds });
        return response.data;
      } catch (error) {
        throw error;
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
        throw error;
      }
    },

    getWashingVendors: async (search = '', showInactive = false) => {
      try {
        const response = await axiosInstance.get('api/washing-vendors', {
          params: { search, showInactive },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    toggleWashingVendorActive: async (id) => {
      try {
        const response = await axiosInstance.put(`api/washing-vendors/${id}/toggle-active`);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    updateWashingVendor: async (id, vendorData) => {
      try {
        const response = await axiosInstance.patch(`api/washing-vendors/${id}`, vendorData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    reorderWashingVendors: async (orderedIds) => {
      try {
        const response = await axiosInstance.patch('api/washing-vendors/reorder', { order: orderedIds });
        return response.data;
      } catch (error) {
        throw error;
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
        throw error;
      }
    },

    getFinishingVendors: async (search = '', showInactive = false) => {
      try {
        const response = await axiosInstance.get('api/finishing-vendors', {
          params: { search, showInactive },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    toggleFinishingVendorActive: async (id) => {
      try {
        const response = await axiosInstance.put(`api/finishing-vendors/${id}/toggle-active`);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    updateFinishingVendor: async (id, vendorData) => {
      try {
        const response = await axiosInstance.patch(`api/finishing-vendors/${id}`, vendorData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    reorderFinishingVendors: async (orderedIds) => {
      try {
        const response = await axiosInstance.patch('api/finishing-vendors/reorder', { order: orderedIds });
        return response.data;
      } catch (error) {
        throw error;
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
        throw error;
      }
    },

    searchByInvoiceNumber: async (invoiceNumber, orderId) => {
      try {
        const response = await axiosInstance.get('api/lots/search/invoiceNumber', {
          params: { invoiceNumber, orderId },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },
  },

  client: {
    createClient: async (clientData) => {
      try {
        const response = await axiosInstance.post('api/clients', clientData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    toggleClientActive: async (id) => {
      try {
        const response = await axiosInstance.put(`api/clients/${id}/toggle-active`);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    getClients: async (search = '', showInactive = false) => {
      try {
        const response = await axiosInstance.get('api/clients', {
          params: { search, showInactive },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    updateClient: async (id, clientData) => {
      try {
        const response = await axiosInstance.patch(`api/clients/${id}`, clientData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    reorderClients: async (orderedIds) => {
      try {
        const response = await axiosInstance.patch('api/clients/reorder', { order: orderedIds });
        return response.data;
      } catch (error) {
        throw error;
      }
    },
  },

  // Vendor Payments API calls
  vendorPayments: {
    getVendorsByType: async (vendorType) => {
      try {
        const response = await axiosInstance.get('api/vendor-balances/vendors-by-type', {
          params: { vendorType },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    getVendorLotsDetails: async (vendorId, vendorType) => {
      try {
        const response = await axiosInstance.get('api/vendor-balances/vendor-lots-details', {
          params: { vendorId, vendorType },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    getVendorPaymentEntries: async (vendorId, vendorType) => {
      try {
        const response = await axiosInstance.get('api/vendor-balances/vendor-payment-entries', {
          params: { vendorId, vendorType },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    getVendorBalanceSummary: async (vendorId, vendorType) => {
      try {
        const response = await axiosInstance.get('api/vendor-balances/vendor-balance-summary', {
          params: { vendorId, vendorType },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    addVendorPayment: async (paymentData) => {
      try {
        const response = await axiosInstance.post('api/vendor-balances/vendor-payment', paymentData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    addShortAdjustment: async (adjustmentData) => {
      try {
        const response = await axiosInstance.post('api/vendor-balances/short-adjustment', adjustmentData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    updatePaymentEntry: async (entryId, updateData) => {
      try {
        const response = await axiosInstance.put(`api/vendor-balances/vendor-payment/${entryId}`, updateData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    deletePaymentEntry: async (entryId) => {
      try {
        const response = await axiosInstance.delete(`api/vendor-balances/vendor-payment/${entryId}`);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    getPaymentEntryHistory: async (entryId) => {
      try {
        const response = await axiosInstance.get(`api/vendor-balances/vendor-payment-history/${entryId}`);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    getVendorPaymentHistory: async (vendorId, vendorType) => {
      try {
        const response = await axiosInstance.get('api/vendor-balances/vendor-payment-changes', {
          params: { vendorId, vendorType },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    markLotPaid: async (payload) => {
      try {
        const response = await axiosInstance.patch('api/vendor-balances/lot-paid', payload);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    exportLotsToExcel: async (vendorId, vendorType) => {
      try {
        const response = await axiosInstance.get('api/vendor-balances/export-lots-excel', {
          params: { vendorId, vendorType },
          responseType: 'blob',
        });
        return response;
      } catch (error) {
        throw error;
      }
    },

    exportPaymentsToExcel: async (vendorId, vendorType) => {
      try {
        const response = await axiosInstance.get('api/vendor-balances/export-payments-excel', {
          params: { vendorId, vendorType },
          responseType: 'blob',
        });
        return response;
      } catch (error) {
        throw error;
      }
    },
  },

  // Sales invoices (dispatch + billing)
  salesInvoices: {
    listInvoices: async (params = {}) => {
      try {
        const response = await axiosInstance.get('api/sales-invoices', { params });
        return response.data;
      } catch (error) { throw error; }
    },
    getInvoiceById: async (id) => {
      try {
        const response = await axiosInstance.get(`api/sales-invoices/${id}`);
        return response.data;
      } catch (error) { throw error; }
    },
    createInvoice: async (payload) => {
      try {
        const response = await axiosInstance.post('api/sales-invoices', payload);
        return response.data;
      } catch (error) { throw error; }
    },
    updateInvoice: async (id, payload) => {
      try {
        const response = await axiosInstance.patch(`api/sales-invoices/${id}`, payload);
        return response.data;
      } catch (error) { throw error; }
    },
    cancelInvoice: async (id) => {
      try {
        const response = await axiosInstance.post(`api/sales-invoices/${id}/cancel`);
        return response.data;
      } catch (error) { throw error; }
    },
    deleteInvoice: async (id) => {
      try {
        const response = await axiosInstance.delete(`api/sales-invoices/${id}`);
        return response.data;
      } catch (error) { throw error; }
    },
    getInvoiceHistory: async (id) => {
      try {
        const response = await axiosInstance.get(`api/sales-invoices/${id}/history`);
        return response.data;
      } catch (error) { throw error; }
    },
    getLotsAvailable: async (params = {}) => {
      try {
        const response = await axiosInstance.get('api/sales-invoices/lots-available', { params });
        return response.data;
      } catch (error) { throw error; }
    },
    getLotsDamagedAvailable: async (params = {}) => {
      try {
        const response = await axiosInstance.get('api/sales-invoices/lots-damaged-available', { params });
        return response.data;
      } catch (error) { throw error; }
    },
    getPendingDispatch: async (params = {}) => {
      try {
        const response = await axiosInstance.get('api/sales-invoices/pending-dispatch', { params });
        return response.data;
      } catch (error) { throw error; }
    },
    updateLotDamaged: async (lotId, damagedPcs) => {
      try {
        const response = await axiosInstance.patch(`api/sales-invoices/lots/${lotId}/damaged`, { damagedPcs });
        return response.data;
      } catch (error) { throw error; }
    },
    getInvoiceCounter: async (fyShort) => {
      try {
        const response = await axiosInstance.get('api/sales-invoices/counter', { params: fyShort ? { fyShort } : {} });
        return response.data;
      } catch (error) { throw error; }
    },
    setInvoiceCounter: async (fyShort, sequence) => {
      try {
        const response = await axiosInstance.put('api/sales-invoices/counter', { fyShort, sequence });
        return response.data;
      } catch (error) { throw error; }
    },
  },

  // Client balances and payments (mirror of vendorPayments)
  clientPayments: {
    getClientsWithBalance: async () => {
      try {
        const response = await axiosInstance.get('api/client-balances/clients-with-balance');
        return response.data;
      } catch (error) { throw error; }
    },
    getClientLedger: async (clientId) => {
      try {
        const response = await axiosInstance.get('api/client-balances/client-invoices-payments', { params: { clientId } });
        return response.data;
      } catch (error) { throw error; }
    },
    getClientBalanceSummary: async (clientId) => {
      try {
        const response = await axiosInstance.get('api/client-balances/client-balance-summary', { params: { clientId } });
        return response.data;
      } catch (error) { throw error; }
    },
    setOpeningBalance: async (clientId, openingBalance) => {
      try {
        const response = await axiosInstance.patch('api/client-balances/opening-balance', { clientId, openingBalance });
        return response.data;
      } catch (error) { throw error; }
    },
    addClientPayment: async (payload) => {
      try {
        const response = await axiosInstance.post('api/client-balances/client-payment', payload);
        return response.data;
      } catch (error) { throw error; }
    },
    addClientAdjustment: async (payload) => {
      try {
        const response = await axiosInstance.post('api/client-balances/client-adjustment', payload);
        return response.data;
      } catch (error) { throw error; }
    },
    getClientPaymentEntries: async (clientId) => {
      try {
        const response = await axiosInstance.get('api/client-balances/client-payment-entries', { params: { clientId } });
        return response.data;
      } catch (error) { throw error; }
    },
    updatePaymentEntry: async (entryId, payload) => {
      try {
        const response = await axiosInstance.put(`api/client-balances/client-payment/${entryId}`, payload);
        return response.data;
      } catch (error) { throw error; }
    },
    deletePaymentEntry: async (entryId) => {
      try {
        const response = await axiosInstance.delete(`api/client-balances/client-payment/${entryId}`);
        return response.data;
      } catch (error) { throw error; }
    },
    getEntryHistory: async (entryId) => {
      try {
        const response = await axiosInstance.get(`api/client-balances/client-payment-history/${entryId}`);
        return response.data;
      } catch (error) { throw error; }
    },
    getClientPaymentHistory: async (clientId) => {
      try {
        const response = await axiosInstance.get('api/client-balances/client-payment-changes', { params: { clientId } });
        return response.data;
      } catch (error) { throw error; }
    },
  },

  // Company settings (singleton — seller side of invoice)
  companySettings: {
    getSettings: async () => {
      try {
        const response = await axiosInstance.get('api/company-settings');
        return response.data;
      } catch (error) { throw error; }
    },
    updateSettings: async (payload) => {
      try {
        const response = await axiosInstance.put('api/company-settings', payload);
        return response.data;
      } catch (error) { throw error; }
    },
  },

  fitStyles: {
    createFitstyles: async (fitStyleData) => {
      try {
        const response = await axiosInstance.post('api/fitstyles', fitStyleData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    getFitstyles: async (search = '', showInactive = false) => {
      try {
        const response = await axiosInstance.get('api/fitstyles', {
          params: { search, showInactive },
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    toggleFitstyleActive: async (id) => {
      try {
        const response = await axiosInstance.put(`api/fitstyles/${id}/toggle-active`);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    updateFitstyle: async (id, fitStyleData) => {
      try {
        const response = await axiosInstance.patch(`api/fitstyles/${id}`, fitStyleData);
        return response.data;
      } catch (error) {
        throw error;
      }
    },

    reorderFitstyles: async (orderedIds) => {
      try {
        const response = await axiosInstance.patch('api/fitstyles/reorder', { order: orderedIds });
        return response.data;
      } catch (error) {
        throw error;
      }
    },
  },

  // Stock Management / Accessories
  accessories: {
    getTypes: async () => {
      try {
        const response = await axiosInstance.get('api/accessories/types');
        return response.data;
      } catch (error) { throw error; }
    },
    updateType: async (id, data) => {
      try {
        const response = await axiosInstance.patch(`api/accessories/types/${id}`, data);
        return response.data;
      } catch (error) { throw error; }
    },

    // Low-stock alerts
    getLowStock: async () => {
      try {
        const response = await axiosInstance.get('api/accessories/low-stock');
        return response.data;
      } catch (error) { throw error; }
    },
    sendLowStockTest: async () => {
      try {
        const response = await axiosInstance.post('api/accessories/low-stock/test');
        return response.data;
      } catch (error) { throw error; }
    },

    // Finishing vendor extras + returns
    getFinishingVendorExtras: async () => {
      try {
        const response = await axiosInstance.get('api/accessories/finishing-vendor-extras');
        return response.data;
      } catch (error) { throw error; }
    },
    // Public, read-only variant used by the anonymous /finishing-extras status board (no auth).
    getFinishingVendorExtrasPublic: async () => {
      try {
        const response = await axiosInstance.get('api/accessories/public/finishing-vendor-extras');
        return response.data;
      } catch (error) { throw error; }
    },
    createVendorReturn: async (payload) => {
      try {
        const response = await axiosInstance.post('api/accessories/vendor-returns', payload);
        return response.data;
      } catch (error) { throw error; }
    },
    getVendorReturns: async (vendorId = '', itemId = '') => {
      try {
        const response = await axiosInstance.get('api/accessories/vendor-returns', {
          params: { vendorId, itemId },
        });
        return response.data;
      } catch (error) { throw error; }
    },
    deleteVendorReturn: async (id) => {
      try {
        const response = await axiosInstance.delete(`api/accessories/vendor-returns/${id}`);
        return response.data;
      } catch (error) { throw error; }
    },

    // Masters / items
    getItems: async ({ typeId, search = '', clientId = '', showInactive = false } = {}) => {
      try {
        const response = await axiosInstance.get('api/accessories/items', {
          params: { typeId, search, clientId, showInactive },
        });
        return response.data;
      } catch (error) { throw error; }
    },
    getApplicableItems: async (typeId, clientId = '') => {
      try {
        const response = await axiosInstance.get('api/accessories/items/applicable', {
          params: { typeId, clientId },
        });
        return response.data;
      } catch (error) { throw error; }
    },
    getFinishingItems: async (invoiceNumber) => {
      try {
        const response = await axiosInstance.get('api/accessories/finishing-items', {
          params: { invoiceNumber },
        });
        return response.data;
      } catch (error) { throw error; }
    },
    createItem: async (itemData) => {
      try {
        const response = await axiosInstance.post('api/accessories/items', itemData);
        return response.data;
      } catch (error) { throw error; }
    },
    updateItem: async (id, itemData) => {
      try {
        const response = await axiosInstance.patch(`api/accessories/items/${id}`, itemData);
        return response.data;
      } catch (error) { throw error; }
    },
    toggleItemActive: async (id) => {
      try {
        const response = await axiosInstance.put(`api/accessories/items/${id}/toggle-active`);
        return response.data;
      } catch (error) { throw error; }
    },

    // Purchases
    getPurchases: async (typeId, page = 1, limit = 10) => {
      try {
        const response = await axiosInstance.get('api/accessories/purchases', { params: { typeId, page, limit } });
        return response.data;
      } catch (error) { throw error; }
    },
    createPurchase: async (purchaseData) => {
      try {
        const response = await axiosInstance.post('api/accessories/purchases', purchaseData);
        return response.data;
      } catch (error) { throw error; }
    },
    updatePurchase: async (id, purchaseData) => {
      try {
        const response = await axiosInstance.patch(`api/accessories/purchases/${id}`, purchaseData);
        return response.data;
      } catch (error) { throw error; }
    },
    markPurchasePaid: async (id, isPaid) => {
      try {
        const response = await axiosInstance.patch(`api/accessories/purchases/${id}/paid`, { isPaid });
        return response.data;
      } catch (error) { throw error; }
    },
    deletePurchase: async (id) => {
      try {
        const response = await axiosInstance.delete(`api/accessories/purchases/${id}`);
        return response.data;
      } catch (error) { throw error; }
    },

    // Payments
    getPayments: async (typeId, page = 1, limit = 10) => {
      try {
        const response = await axiosInstance.get('api/accessories/payments', { params: { typeId, page, limit } });
        return response.data;
      } catch (error) { throw error; }
    },
    addPayment: async (paymentData) => {
      try {
        const response = await axiosInstance.post('api/accessories/payments', paymentData);
        return response.data;
      } catch (error) { throw error; }
    },
    updatePayment: async (id, paymentData) => {
      try {
        const response = await axiosInstance.put(`api/accessories/payments/${id}`, paymentData);
        return response.data;
      } catch (error) { throw error; }
    },
    deletePayment: async (id) => {
      try {
        const response = await axiosInstance.delete(`api/accessories/payments/${id}`);
        return response.data;
      } catch (error) { throw error; }
    },
    getPaymentHistory: async (id) => {
      try {
        const response = await axiosInstance.get(`api/accessories/payments/${id}/history`);
        return response.data;
      } catch (error) { throw error; }
    },

    // Balance / stock / consumption
    getBalance: async (typeId) => {
      try {
        const response = await axiosInstance.get('api/accessories/balance', { params: { typeId } });
        return response.data;
      } catch (error) { throw error; }
    },
    setOpeningBalance: async (accessoryTypeId, openingBalance) => {
      try {
        const response = await axiosInstance.patch('api/accessories/opening-balance', { accessoryTypeId, openingBalance });
        return response.data;
      } catch (error) { throw error; }
    },
    getStock: async (typeId, clientId = '') => {
      try {
        const response = await axiosInstance.get('api/accessories/stock', { params: { typeId, clientId } });
        return response.data;
      } catch (error) { throw error; }
    },
    getStockSummary: async (clientId = '') => {
      try {
        const response = await axiosInstance.get('api/accessories/stock/summary', { params: { clientId } });
        return response.data;
      } catch (error) { throw error; }
    },
    getConsumption: async (lotId, stage = '') => {
      try {
        const response = await axiosInstance.get('api/accessories/consumption', { params: { lotId, stage } });
        return response.data;
      } catch (error) { throw error; }
    },
  },
};

export default apiService;