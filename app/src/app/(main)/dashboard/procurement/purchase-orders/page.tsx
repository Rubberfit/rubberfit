import { redirect } from 'next/navigation';

export default function ProcurementPurchaseOrdersPage() {
  // Redirect to the actual purchase orders page in inventory
  redirect('/dashboard/inventory/purchase-orders');
}