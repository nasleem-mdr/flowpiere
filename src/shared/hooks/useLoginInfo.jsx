export const getLoginInfo = () => ({
  userId:      parseInt(localStorage.getItem('AD_User_ID'))     || null,
  warehouseId: parseInt(localStorage.getItem('M_Warehouse_ID')) || null,
  orgId:       parseInt(localStorage.getItem('AD_Org_ID'))      || null,
  clientId:    parseInt(localStorage.getItem('AD_Client_ID'))   || null,
  roleId:      parseInt(localStorage.getItem('AD_Role_ID'))     || null,
  userName:    localStorage.getItem('UserName') || localStorage.getItem('Name') || 'User',
});

export const SESSION_FIELD_LABELS = {
  AD_User_ID:      'User ID',
  M_Warehouse_ID:  'Warehouse ID',
  AD_Org_ID:       'Organization ID',
  AD_Client_ID:    'Client ID',
};

// Nama kolom → label yang ramah dibaca. Kolom yang belum terdaftar tetap tampil apa adanya.
export const sessionFieldLabel = (key) => SESSION_FIELD_LABELS[key] ?? key;

export const getMissingSessionFields = (info) => [
  !info.userId      && 'AD_User_ID',
  !info.warehouseId && 'M_Warehouse_ID',
  !info.orgId       && 'AD_Org_ID',
  !info.clientId    && 'AD_Client_ID',
].filter(Boolean);