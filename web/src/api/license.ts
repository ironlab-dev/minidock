export const licenseClient = {
  status: () => client.get('/license/status'),
  activate: (key) => client.post('/license/activate', { key }),
  deactivate: () => client.post('/license/deactivate')
};
