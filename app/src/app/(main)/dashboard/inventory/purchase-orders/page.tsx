"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Plus,
  Edit2,
  Eye,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  Truck,
  DollarSign,
  Calendar,
  Building2,
  AlertCircle,
  Download,
  Filter,
  Search,
  MoreVertical,
  Mail,
  ClipboardCheck,
  X,
  MapPin,
  Phone,
  User
} from "lucide-react";
import { format, addDays } from "date-fns";

import {
  supabase,
  type PurchaseOrder,
  type PurchaseOrderWithDetails,
  type PurchaseOrderItem,
  type Supplier,
  type MaterialType
} from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { taxService } from "@/services/taxService";
import { toast } from "sonner";
import { ConfirmationDialog } from "@/components/common/confirmation-dialog";

interface POFormData {
  supplier_id: string;
  requested_delivery_date: string;
  payment_terms: string;
  shipping_address: string;
  billing_address: string;
  notes: string;
  items: Array<{
    material_type_id: string;
    description: string;
    width?: number;
    length?: number;
    thickness?: number;
    color?: string;
    quantity_sqft: number;
    unit_cost: number;
  }>;
}

interface POStats {
  total: number;
  draft: number;
  pending: number;
  approved: number;
  ordered: number;
  received: number;
  cancelled: number;
  totalValue: number;
  avgLeadTime: number;
}

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderWithDetails[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrderWithDetails | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrderWithDetails | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState("30");
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedPOTaxDetails, setSelectedPOTaxDetails] = useState<{
    taxRate: number;
    taxName: string;
    taxLevel: string;
  } | null>(null);
  const [createFormTaxDetails, setCreateFormTaxDetails] = useState<{
    taxRate: number;
    taxName: string;
    taxLevel: string;
  } | null>(null);
  const [editFormTaxDetails, setEditFormTaxDetails] = useState<{
    taxRate: number;
    taxName: string;
    taxLevel: string;
  } | null>(null);

  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<{
    open: boolean;
    action: () => void;
    title: string;
    description: string;
    variant?: 'danger' | 'warning' | 'info';
  }>({
    open: false,
    action: () => {},
    title: '',
    description: '',
    variant: 'danger'
  });

  // Form state for new PO
  const [formData, setFormData] = useState<POFormData>({
    supplier_id: "",
    requested_delivery_date: format(addDays(new Date(), 7), "yyyy-MM-dd"),
    payment_terms: "Net 30",
    shipping_address: "",
    billing_address: "",
    notes: "",
    items: []
  });

  // Form state for editing PO
  const [editFormData, setEditFormData] = useState<POFormData>({
    supplier_id: "",
    requested_delivery_date: format(addDays(new Date(), 7), "yyyy-MM-dd"),
    payment_terms: "Net 30",
    shipping_address: "",
    billing_address: "",
    notes: "",
    items: []
  });

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch purchase orders
      const { data: posData, error: posError } = await supabase
        .from("purchase_orders")
        .select(`
          *,
          supplier:suppliers(*),
          items:purchase_order_items(*)
        `)
        .order("created_at", { ascending: false });

      if (posError) throw posError;
      setPurchaseOrders(posData || []);

      // Fetch suppliers
      const { data: suppliersData, error: suppliersError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("active", true)
        .order("name");

      if (suppliersError) throw suppliersError;
      setSuppliers(suppliersData || []);

      // Fetch material types
      const { data: materialsData, error: materialsError } = await supabase
        .from("material_types")
        .select("*")
        .order("name");

      if (materialsError) throw materialsError;
      setMaterialTypes(materialsData || []);

    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch tax details when a PO is selected for viewing
  const fetchTaxDetails = async (po: PurchaseOrderWithDetails) => {
    try {
      // Check if supplier_id exists
      if (!po.supplier_id) {
        console.warn("PO has no supplier_id, using stored tax amount", { poId: po.id });
        setSelectedPOTaxDetails({
          taxRate: po.tax_amount ? po.tax_amount / po.subtotal : 0.08,
          taxName: "Stored Tax",
          taxLevel: "stored"
        });
        return;
      }

      const taxCalc = await taxService.calculatePurchaseOrderTax(po.supplier_id, po.subtotal);
      setSelectedPOTaxDetails({
        taxRate: taxCalc.taxRate,
        taxName: taxCalc.taxName,
        taxLevel: taxCalc.taxLevel
      });
    } catch (error) {
      console.error("Error fetching tax details:", error);
      // Use stored tax or defaults if error
      setSelectedPOTaxDetails({
        taxRate: po.tax_amount ? po.tax_amount / po.subtotal : 0.08,
        taxName: "Fallback Tax",
        taxLevel: "fallback"
      });
    }
  };

  // Fetch tax details for create form when supplier changes
  useEffect(() => {
    const fetchCreateFormTaxDetails = async () => {
      if (!formData.supplier_id) {
        setCreateFormTaxDetails(null);
        return;
      }

      try {
        const subtotal = formData.items.reduce((sum, item) =>
          sum + (item.quantity_sqft * item.unit_cost), 0
        );
        const taxCalc = await taxService.calculatePurchaseOrderTax(formData.supplier_id, subtotal);
        setCreateFormTaxDetails({
          taxRate: taxCalc.taxRate,
          taxName: taxCalc.taxName,
          taxLevel: taxCalc.taxLevel
        });
      } catch (error: any) {
        console.error("Error fetching create form tax details:", {
          error: error?.message || error,
          supplierId: formData.supplier_id
        });
        // Use default tax on error
        setCreateFormTaxDetails({
          taxRate: 0.08,
          taxName: "Default Tax (8%)",
          taxLevel: "default"
        });
      }
    };

    fetchCreateFormTaxDetails();
  }, [formData.supplier_id, formData.items]);

  // Fetch tax details for edit form when supplier changes
  useEffect(() => {
    const fetchEditFormTaxDetails = async () => {
      if (!editFormData.supplier_id || editFormData.supplier_id.trim() === '') {
        setEditFormTaxDetails(null);
        return;
      }

      try {
        const subtotal = editFormData.items.reduce((sum, item) =>
          sum + (item.quantity_sqft * item.unit_cost), 0
        );
        const taxCalc = await taxService.calculatePurchaseOrderTax(editFormData.supplier_id, subtotal);
        setEditFormTaxDetails({
          taxRate: taxCalc.taxRate,
          taxName: taxCalc.taxName,
          taxLevel: taxCalc.taxLevel
        });
      } catch (error: any) {
        console.error("Error fetching edit form tax details:", {
          error: error?.message || error,
          supplierId: editFormData.supplier_id
        });
        // Use default tax on error
        setEditFormTaxDetails({
          taxRate: 0.08,
          taxName: "Default Tax (8%)",
          taxLevel: "default"
        });
      }
    };

    fetchEditFormTaxDetails();
  }, [editFormData.supplier_id, editFormData.items]);

  // Check if we should highlight/open a specific PO from URL params
  useEffect(() => {
    const highlightPOId = searchParams.get('highlight');
    const viewPOId = searchParams.get('view');

    if ((highlightPOId || viewPOId) && purchaseOrders.length > 0) {
      const poToHighlight = purchaseOrders.find(po =>
        po.id === highlightPOId || po.id === viewPOId
      );

      if (poToHighlight) {
        // If view parameter is present, open the view dialog
        if (viewPOId) {
          setSelectedPO(poToHighlight);
          fetchTaxDetails(poToHighlight);
          setIsViewDialogOpen(true);
        }

        // Scroll to the PO in the table
        const element = document.getElementById(`po-row-${poToHighlight.id}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('bg-blue-50', 'dark:bg-blue-950');
          setTimeout(() => {
            element.classList.remove('bg-blue-50', 'dark:bg-blue-950');
          }, 3000);
        }
      }

      // Clear the URL params after handling
      router.replace('/dashboard/inventory/purchase-orders');
    }
  }, [purchaseOrders, searchParams, router]);

  // Calculate statistics
  const stats: POStats = useMemo(() => {
    const stats = {
      total: purchaseOrders.length,
      draft: 0,
      pending: 0,
      approved: 0,
      ordered: 0,
      received: 0,
      cancelled: 0,
      totalValue: 0,
      avgLeadTime: 0
    };

    let leadTimeCount = 0;
    let totalLeadTime = 0;

    purchaseOrders.forEach(po => {
      stats[po.status]++;
      stats.totalValue += po.total_amount;

      if (po.actual_delivery_date && po.order_date) {
        const leadTime = Math.floor(
          (new Date(po.actual_delivery_date).getTime() - new Date(po.order_date).getTime())
          / (1000 * 60 * 60 * 24)
        );
        totalLeadTime += leadTime;
        leadTimeCount++;
      }
    });

    stats.avgLeadTime = leadTimeCount > 0 ? Math.round(totalLeadTime / leadTimeCount) : 0;

    return stats;
  }, [purchaseOrders]);

  // Filter purchase orders
  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter(po => {
      if (statusFilter !== "all" && po.status !== statusFilter) return false;
      if (supplierFilter !== "all" && po.supplier_id !== supplierFilter) return false;
      if (searchQuery) {
        const search = searchQuery.toLowerCase();
        return (
          po.po_number.toLowerCase().includes(search) ||
          po.supplier?.name?.toLowerCase().includes(search) ||
          po.notes?.toLowerCase().includes(search)
        );
      }
      return true;
    });
  }, [purchaseOrders, statusFilter, supplierFilter, searchQuery]);

  // Get status badge
  const getStatusBadge = (status: string) => {
    const config = {
      draft: { variant: "secondary" as const, icon: <Edit2 className="h-3 w-3" /> },
      pending: { variant: "warning" as const, icon: <Clock className="h-3 w-3" /> },
      approved: { variant: "default" as const, icon: <CheckCircle className="h-3 w-3" /> },
      ordered: { variant: "outline" as const, icon: <Truck className="h-3 w-3" /> },
      received: { variant: "success" as const, icon: <Package className="h-3 w-3" /> },
      cancelled: { variant: "destructive" as const, icon: <XCircle className="h-3 w-3" /> }
    };

    const cfg = config[status as keyof typeof config] || config.draft;

    return (
      <Badge variant={cfg.variant} className="gap-1">
        {cfg.icon}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Add item to PO form
  const addItemToForm = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        {
          material_type_id: "",
          description: "",
          width: undefined,
          length: undefined,
          thickness: undefined,
          color: "",
          quantity_sqft: 0,
          unit_cost: 0
        }
      ]
    });
  };

  // Remove item from PO form
  const removeItemFromForm = (index: number) => {
    setConfirmAction({
      open: true,
      action: () => {
        setFormData({
          ...formData,
          items: formData.items.filter((_, i) => i !== index)
        });
      },
      title: 'Remove Item?',
      description: `Are you sure you want to remove Item #${index + 1} from this purchase order?`,
      variant: 'warning'
    });
  };

  // Update item in PO form
  const updateItemInForm = (index: number, field: string, value: any) => {
    const updatedItems = [...formData.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setFormData({ ...formData, items: updatedItems });
  };

  // Create purchase order handler
  const handleCreatePO = async () => {
    // Validate required fields
    if (!formData.supplier_id) {
      toast.error("Please select a supplier");
      return;
    }

    if (formData.items.length === 0) {
      toast.error("Please add at least one item to the purchase order");
      return;
    }

    // Validate items
    for (const [index, item] of formData.items.entries()) {
      if (!item.material_type_id) {
        toast.error(`Please select a material type for item #${index + 1}`);
        return;
      }
      if (!item.quantity_sqft || item.quantity_sqft <= 0) {
        toast.error(`Please enter a valid quantity for item #${index + 1}`);
        return;
      }
      if (!item.unit_cost || item.unit_cost <= 0) {
        toast.error(`Please enter a valid unit cost for item #${index + 1}`);
        return;
      }
    }

    setIsCreating(true);

    try {
      // Get supplier details for tax and shipping rates
      const selectedSupplier = suppliers.find(s => s.id === formData.supplier_id);

      // Calculate totals
      const subtotal = formData.items.reduce((sum, item) =>
        sum + (item.quantity_sqft * item.unit_cost), 0
      );

      // Calculate tax using the tax service for automatic location-based calculation
      const taxCalc = await taxService.calculatePurchaseOrderTax(formData.supplier_id, subtotal);

      // Use supplier's shipping cost if available, otherwise default to $50
      const shipping = selectedSupplier?.default_shipping_cost || 50;

      // Show tax information to the user
      if (taxCalc.taxLevel !== 'exempt') {
        toast.info(`Tax calculated: ${taxService.formatTaxRate(taxCalc.taxRate)}`, {
          description: `Based on supplier's ${taxCalc.taxLevel === 'override' ? 'custom rate' : 'location'}`
        });
      }

      const poData = {
        supplier_id: formData.supplier_id,
        status: 'draft' as const,
        order_date: new Date().toISOString(),
        requested_delivery_date: formData.requested_delivery_date,
        subtotal,
        tax_amount: taxCalc.taxAmount,
        shipping_cost: shipping,
        total_amount: subtotal + taxCalc.taxAmount + shipping,
        payment_terms: formData.payment_terms,
        shipping_address: formData.shipping_address,
        billing_address: formData.billing_address,
        notes: formData.notes,
        auto_generated: false
      };

      const response = await purchaseOrderService.createPurchaseOrder(poData);

      if (!response) throw new Error('Failed to create purchase order');

      // Add items to the purchase order
      for (const [index, item] of formData.items.entries()) {
        await purchaseOrderService.addItemToPurchaseOrder({
          purchase_order_id: response.id,
          material_type_id: item.material_type_id,
          quantity_sqft: item.quantity_sqft,
          unit_cost: item.unit_cost,
          description: item.description || '',
          width: item.width,
          thickness: item.thickness,
          color: item.color,
          notes: item.description
        });
      }

      // Show success message
      toast.success(`Purchase Order ${response.po_number} created successfully`, {
        description: "Redirecting to view your new order..."
      });

      // Close dialog
      setIsCreateDialogOpen(false);

      // Reset form
      setFormData({
        supplier_id: "",
        requested_delivery_date: format(addDays(new Date(), 7), "yyyy-MM-dd"),
        payment_terms: "Net 30",
        shipping_address: "",
        billing_address: "",
        notes: "",
        items: []
      });

      // Refresh data first to ensure the new PO is in the list
      await fetchData();

      // Set the newly created PO as selected and open the view dialog
      const newPO = await supabase
        .from("purchase_orders")
        .select(`
          *,
          supplier:suppliers(*),
          items:purchase_order_items(*)
        `)
        .eq('id', response.id)
        .single();

      if (newPO.data) {
        setSelectedPO(newPO.data);
        await fetchTaxDetails(newPO.data);
        setIsViewDialogOpen(true);
      }

      // Optionally scroll to top to see the new PO
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error("Error creating purchase order:", error);
      toast.error("Failed to create purchase order. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  // Download purchase order as PDF
  const handleDownloadPDF = (po: PurchaseOrderWithDetails) => {
    // Create a PDF version of the PO
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Purchase Order #${po.po_number}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
          .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .section { margin-bottom: 20px; }
          .label { font-weight: bold; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f5f5f5; font-weight: bold; }
          .totals { margin-top: 20px; text-align: right; }
          .total-row { display: flex; justify-content: flex-end; margin: 5px 0; }
          .total-label { width: 150px; text-align: right; margin-right: 20px; }
          .total-value { width: 100px; text-align: right; font-weight: bold; }
          .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 12px; }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Purchase Order #${po.po_number}</h1>

        <div class="header">
          <div class="section">
            <div class="label">Date:</div>
            <div>${format(new Date(), 'MMM dd, yyyy')}</div>
            <div class="label" style="margin-top: 10px;">Status:</div>
            <div>${po.status?.toUpperCase() || 'PENDING'}</div>
          </div>
          <div class="section">
            <div class="label">Supplier:</div>
            <div>${po.supplier?.name || 'N/A'}</div>
            <div>${po.supplier?.email || ''}</div>
            <div>${po.supplier?.phone || ''}</div>
          </div>
        </div>

        <div class="header">
          <div class="section">
            <div class="label">Requested Delivery:</div>
            <div>${po.requested_delivery_date ? format(new Date(po.requested_delivery_date), 'MMM dd, yyyy') : 'N/A'}</div>
          </div>
          <div class="section">
            <div class="label">Payment Terms:</div>
            <div>${po.supplier?.payment_terms || 'Net 30'}</div>
          </div>
        </div>

        <div class="section">
          <div class="label">Shipping Address:</div>
          <div>${po.shipping_address || 'Default warehouse address'}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Description</th>
              <th>Quantity</th>
              <th>Unit Cost</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${po.items?.map((item, index) => `
              <tr>
                <td>#${index + 1}</td>
                <td>
                  ${item.description || 'N/A'}
                  ${item.width ? `<br>Width: ${item.width}"` : ''}
                  ${item.thickness ? `<br>Thickness: ${item.thickness}"` : ''}
                  ${item.color ? `<br>Color: ${item.color}` : ''}
                </td>
                <td>${item.quantity_sqft?.toFixed(2) || 0} sq ft</td>
                <td>$${item.unit_cost?.toFixed(2) || 0}</td>
                <td>$${((item.quantity_sqft || 0) * (item.unit_cost || 0)).toFixed(2)}</td>
              </tr>
            `).join('') || '<tr><td colspan="5">No items</td></tr>'}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span class="total-label">Subtotal:</span>
            <span class="total-value">$${po.subtotal?.toFixed(2) || '0.00'}</span>
          </div>
          <div class="total-row">
            <span class="total-label">Tax${po.tax_amount && po.subtotal ? ` (${((po.tax_amount / po.subtotal) * 100).toFixed(1)}%)` : ''}:</span>
            <span class="total-value">$${po.tax_amount?.toFixed(2) || '0.00'}</span>
          </div>
          <div class="total-row">
            <span class="total-label">Shipping:</span>
            <span class="total-value">$${po.shipping_cost?.toFixed(2) || '0.00'}</span>
          </div>
          <div class="total-row" style="font-size: 1.2em; margin-top: 10px; padding-top: 10px; border-top: 2px solid #333;">
            <span class="total-label">Total:</span>
            <span class="total-value">$${po.total_amount?.toFixed(2) || '0.00'}</span>
          </div>
        </div>

        ${po.notes ? `
          <div class="section" style="margin-top: 30px;">
            <div class="label">Notes:</div>
            <div>${po.notes}</div>
          </div>
        ` : ''}

        <div class="footer">
          <p>Generated on ${format(new Date(), 'MMM dd, yyyy HH:mm')} | RubberFit Pro</p>
        </div>
      </body>
      </html>
    `;

    // Generate filename
    const fileName = `PO_${po.po_number}_${format(new Date(), 'yyyyMMdd')}.pdf`;

    // Check if we're in Electron environment
    if (typeof window !== 'undefined' && (window as any).electronAPI?.generatePDF) {
      // Use Electron's PDF generation API
      (window as any).electronAPI.generatePDF(printContent, fileName).then((success: boolean) => {
        if (success) {
          toast.success("PDF saved successfully");
        } else {
          toast.info("PDF download cancelled");
        }
      });
    } else {
      // Fallback for web/development - create a hidden iframe and print
      const printFrame = document.createElement('iframe');
      printFrame.style.position = 'absolute';
      printFrame.style.top = '-9999px';
      printFrame.style.left = '-9999px';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      document.body.appendChild(printFrame);

      if (printFrame.contentWindow) {
        printFrame.contentWindow.document.write(printContent);
        printFrame.contentWindow.document.close();
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
      }

      // Clean up after a delay
      setTimeout(() => {
        document.body.removeChild(printFrame);
      }, 1000);
    }
  };

  // Update PO status
  const updatePOStatus = async (poId: string, newStatus: PurchaseOrder['status']) => {
    try {
      const response = await purchaseOrderService.updatePurchaseOrderStatus(poId, newStatus);
      if (!response) throw new Error('Failed to update status');

      setPurchaseOrders(pos =>
        pos.map(po => po.id === poId ? { ...po, status: newStatus } : po)
      );

      // Show appropriate toast message
      switch (newStatus) {
        case 'pending':
          toast.success("Purchase order submitted for approval");
          break;
        case 'approved':
          toast.success("Purchase order approved");
          break;
        case 'ordered':
          toast.success("Purchase order marked as ordered");
          break;
        case 'received':
          toast.success("Goods received and inventory updated");
          // TODO: Update inventory based on received items
          break;
        case 'cancelled':
          toast.success("Purchase order cancelled");
          break;
      }
    } catch (error) {
      console.error("Error updating PO status:", error);
      toast.error("Failed to update purchase order status");
    }
  };

  // Open edit dialog with PO data
  const handleEditPO = (po: PurchaseOrderWithDetails) => {
    setEditingPO(po);

    // Find the supplier to get address info
    const supplier = suppliers.find(s => s.id === po.supplier_id);

    // Build supplier address from components
    const buildSupplierAddress = (supplier: Supplier | undefined) => {
      if (!supplier) return "";
      const parts = [];
      if (supplier.address) parts.push(supplier.address);
      const cityStateZip = [
        supplier.city,
        supplier.state,
        supplier.zip_code
      ].filter(Boolean).join(" ");
      if (cityStateZip) parts.push(cityStateZip);
      if (supplier.country) parts.push(supplier.country);
      return parts.join(", ") || "";
    };

    const supplierAddress = buildSupplierAddress(supplier);

    setEditFormData({
      supplier_id: po.supplier_id,
      requested_delivery_date: po.requested_delivery_date ?
        format(new Date(po.requested_delivery_date), "yyyy-MM-dd") :
        format(addDays(new Date(), 7), "yyyy-MM-dd"),
      payment_terms: po.payment_terms || "Net 30",
      shipping_address: po.shipping_address || supplierAddress || "",
      billing_address: po.billing_address || supplierAddress || "",
      notes: po.notes || "",
      items: po.items?.map(item => ({
        material_type_id: item.material_type_id || "",
        description: item.description || "",
        width: item.width || undefined,
        length: undefined, // Not stored in DB
        thickness: item.thickness || undefined,
        color: item.color || "",
        quantity_sqft: item.quantity_sqft,
        unit_cost: item.unit_cost
      })) || []
    });
    setIsEditDialogOpen(true);
  };

  // Handle update PO submission
  const handleUpdatePO = async () => {
    // Validate required fields
    if (!editFormData.supplier_id) {
      toast.error("Please select a supplier");
      return;
    }

    if (editFormData.items.length === 0) {
      toast.error("Please add at least one item to the purchase order");
      return;
    }

    // Validate items
    for (const [index, item] of editFormData.items.entries()) {
      if (!item.material_type_id) {
        toast.error(`Please select a material type for item #${index + 1}`);
        return;
      }
      if (!item.quantity_sqft || item.quantity_sqft <= 0) {
        toast.error(`Please enter a valid quantity for item #${index + 1}`);
        return;
      }
      if (!item.unit_cost || item.unit_cost <= 0) {
        toast.error(`Please enter a valid unit cost for item #${index + 1}`);
        return;
      }
    }

    if (!editingPO) return;

    setIsUpdating(true);

    try {
      // Calculate totals with consistent logic
      const subtotal = editFormData.items.reduce((sum, item) =>
        sum + (item.quantity_sqft * item.unit_cost), 0
      );

      // Calculate tax using the tax service for automatic location-based calculation
      const taxCalc = await taxService.calculatePurchaseOrderTax(editFormData.supplier_id, subtotal);

      // Get supplier details for shipping
      const selectedSupplier = suppliers.find(s => s.id === editFormData.supplier_id);
      const shipping = selectedSupplier?.default_shipping_cost || 50;

      // Show tax information to the user
      if (taxCalc.taxLevel !== 'exempt') {
        toast.info(`Tax recalculated: ${taxService.formatTaxRate(taxCalc.taxRate)}`, {
          description: `Based on supplier's ${taxCalc.taxLevel === 'override' ? 'custom rate' : 'location'}`
        });
      }

      // Update the PO
      const { error: updateError } = await supabase
        .from("purchase_orders")
        .update({
          supplier_id: editFormData.supplier_id,
          requested_delivery_date: editFormData.requested_delivery_date,
          subtotal,
          tax_amount: taxCalc.taxAmount,
          shipping_cost: shipping,
          total_amount: subtotal + taxCalc.taxAmount + shipping,
          payment_terms: editFormData.payment_terms,
          shipping_address: editFormData.shipping_address,
          billing_address: editFormData.billing_address,
          notes: editFormData.notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingPO.id);

      if (updateError) throw updateError;

      // Delete existing items
      const { error: deleteError } = await supabase
        .from("purchase_order_items")
        .delete()
        .eq('purchase_order_id', editingPO.id);

      if (deleteError) throw deleteError;

      // Add updated items
      for (const [index, item] of editFormData.items.entries()) {
        await purchaseOrderService.addItemToPurchaseOrder({
          purchase_order_id: editingPO.id,
          material_type_id: item.material_type_id,
          quantity_sqft: item.quantity_sqft,
          unit_cost: item.unit_cost,
          description: item.description || '',
          width: item.width,
          thickness: item.thickness,
          color: item.color,
          notes: item.description
        });
      }

      // Show success message
      toast.success(`Purchase Order ${editingPO.po_number} updated successfully`);

      // Close dialog
      setIsEditDialogOpen(false);

      // Refresh data
      await fetchData();

      // Clear edit form
      setEditingPO(null);
      setEditFormData({
        supplier_id: "",
        requested_delivery_date: format(addDays(new Date(), 7), "yyyy-MM-dd"),
        payment_terms: "Net 30",
        shipping_address: "",
        billing_address: "",
        notes: "",
        items: []
      });

    } catch (error) {
      console.error("Error updating purchase order:", error);
      toast.error("Failed to update purchase order. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  // Add item to edit form
  const addItemToEditForm = () => {
    setEditFormData({
      ...editFormData,
      items: [
        ...editFormData.items,
        {
          material_type_id: "",
          description: "",
          width: undefined,
          length: undefined,
          thickness: undefined,
          color: "",
          quantity_sqft: 0,
          unit_cost: 0
        }
      ]
    });
  };

  // Remove item from edit form
  const removeItemFromEditForm = (index: number) => {
    setConfirmAction({
      open: true,
      action: () => {
        setEditFormData({
          ...editFormData,
          items: editFormData.items.filter((_, i) => i !== index)
        });
      },
      title: 'Remove Item?',
      description: `Are you sure you want to remove Item #${index + 1} from this purchase order?`,
      variant: 'warning'
    });
  };

  // Update item in edit form
  const updateItemInEditForm = (index: number, field: string, value: any) => {
    const updatedItems = [...editFormData.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setEditFormData({ ...editFormData, items: updatedItems });
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Purchase Orders</h1>
          <p className="text-muted-foreground">
            Manage purchase orders and track deliveries
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Purchase Order
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total POs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="flex gap-2 mt-2">
              <Badge variant="secondary">{stats.draft} draft</Badge>
              <Badge variant="warning">{stats.pending} pending</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${stats.totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Transit</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.ordered}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting delivery
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Lead Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgLeadTime} days</div>
            <p className="text-xs text-muted-foreground">
              From order to delivery
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Approvals Alert */}
      {stats.pending > 0 && (
        <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Pending Approvals</AlertTitle>
          <AlertDescription>
            {stats.pending} purchase order(s) are awaiting approval.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Purchase Orders</CardTitle>
              <CardDescription>
                View and manage all purchase orders
              </CardDescription>
            </div>
            <Button variant="outline" className="min-h-[44px]">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search PO number, supplier, or notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="ordered">Ordered</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Suppliers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Purchase Orders Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Loading purchase orders...
                    </TableCell>
                  </TableRow>
                ) : filteredPOs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      No purchase orders found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPOs.map((po) => (
                    <TableRow key={po.id} id={`po-row-${po.id}`} className="transition-colors duration-300">
                      <TableCell className="font-medium">
                        {po.po_number}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {po.supplier?.name || "Unknown"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(po.status)}
                      </TableCell>
                      <TableCell>
                        {po.order_date
                          ? format(new Date(po.order_date), "MMM dd, yyyy")
                          : "—"
                        }
                      </TableCell>
                      <TableCell>
                        {po.requested_delivery_date ? (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(po.requested_delivery_date), "MMM dd")}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {po.items?.length || 0} items
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono font-semibold">
                          ${po.total_amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="min-h-[44px] min-w-[44px]">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={async () => {
                                setSelectedPO(po);
                                await fetchTaxDetails(po);
                                setIsViewDialogOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {po.status === 'draft' && (
                              <>
                                <DropdownMenuItem onClick={() => handleEditPO(po)}>
                                  <Edit2 className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => updatePOStatus(po.id, 'pending')}
                                >
                                  <Send className="h-4 w-4 mr-2" />
                                  Submit for Approval
                                </DropdownMenuItem>
                              </>
                            )}
                            {po.status === 'pending' && (
                              <DropdownMenuItem
                                onClick={() => updatePOStatus(po.id, 'approved')}
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Approve
                              </DropdownMenuItem>
                            )}
                            {po.status === 'approved' && (
                              <DropdownMenuItem
                                onClick={() => updatePOStatus(po.id, 'ordered')}
                              >
                                <Truck className="h-4 w-4 mr-2" />
                                Mark as Ordered
                              </DropdownMenuItem>
                            )}
                            {po.status === 'ordered' && (
                              <DropdownMenuItem
                                onClick={() => updatePOStatus(po.id, 'received')}
                              >
                                <ClipboardCheck className="h-4 w-4 mr-2" />
                                Receive Goods
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDownloadPDF(po)}>
                              <Download className="h-4 w-4 mr-2" />
                              Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Mail className="h-4 w-4 mr-2" />
                              Email to Supplier
                            </DropdownMenuItem>
                            {po.status === 'draft' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => {
                                    setConfirmAction({
                                      open: true,
                                      action: async () => {
                                        try {
                                          const result = await purchaseOrderService.updatePurchaseOrderStatus(po.id, 'cancelled');

                                          if (result) {
                                            toast.success("Purchase order cancelled");
                                            fetchData(); // Refresh the list
                                          } else {
                                            toast.error("Failed to cancel purchase order");
                                          }
                                        } catch (error) {
                                          console.error('Error canceling PO:', error);
                                          toast.error("Failed to cancel purchase order");
                                        }
                                      },
                                      title: 'Cancel Purchase Order?',
                                      description: `Are you sure you want to cancel PO #${po.po_number}? This action cannot be undone.`,
                                      variant: 'danger'
                                    });
                                  }}
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Cancel
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create PO Dialog */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) {
            // Reset form when closing
            setFormData({
              supplier_id: "",
              requested_delivery_date: format(addDays(new Date(), 7), "yyyy-MM-dd"),
              payment_terms: "Net 30",
              shipping_address: "",
              billing_address: "",
              notes: "",
              items: []
            });
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Purchase Order</DialogTitle>
            <DialogDescription>
              Create a new purchase order for materials
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Order Details Card */}
            <Card>
              <CardHeader>
                <CardTitle>Order Details</CardTitle>
                <CardDescription>Basic information for this purchase order</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="supplier">Supplier *</Label>
                    <Select value={formData.supplier_id} onValueChange={(value) => {
                      // Update supplier and update addresses if they are still default/empty
                      const newSupplier = suppliers.find(s => s.id === value);
                      const buildAddress = (supplier: Supplier | undefined) => {
                        if (!supplier) return "";
                        const parts = [];
                        if (supplier.address) parts.push(supplier.address);
                        const cityStateZip = [
                          supplier.city,
                          supplier.state,
                          supplier.zip_code
                        ].filter(Boolean).join(" ");
                        if (cityStateZip) parts.push(cityStateZip);
                        if (supplier.country) parts.push(supplier.country);
                        return parts.join(", ") || "";
                      };
                      const newAddress = buildAddress(newSupplier);

                      setFormData({
                        ...formData,
                        supplier_id: value,
                        // Update addresses if they're empty
                        shipping_address: !formData.shipping_address ? newAddress : formData.shipping_address,
                        billing_address: !formData.billing_address ? newAddress : formData.billing_address
                      });
                    }}>
                      <SelectTrigger className="min-h-[44px]">
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formData.supplier_id && (() => {
                      const selectedSupplier = suppliers.find(s => s.id === formData.supplier_id);
                      return selectedSupplier && (selectedSupplier.city || selectedSupplier.state) ? (
                        <p className="text-sm text-gray-600 mt-1">
                          <MapPin className="inline h-3 w-3 mr-1" />
                          {selectedSupplier.city && `${selectedSupplier.city}, `}
                          {selectedSupplier.state} {selectedSupplier.zip_code}
                          {selectedSupplier.tax_exempt && (
                            <Badge variant="outline" className="ml-2 text-xs">Tax Exempt</Badge>
                          )}
                        </p>
                      ) : null;
                    })()}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="delivery_date">Requested Delivery Date</Label>
                    <Input
                      type="date"
                      value={formData.requested_delivery_date}
                      onChange={(e) => setFormData({
                        ...formData,
                        requested_delivery_date: e.target.value
                      })}
                      className="min-h-[44px]"
                    />
                  </div>
                </div>

                {/* Payment Terms */}
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="payment_terms">Payment Terms</Label>
                    <Select value={formData.payment_terms} onValueChange={(value) =>
                      setFormData({ ...formData, payment_terms: value })
                    }>
                      <SelectTrigger className="min-h-[44px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Net 30">Net 30</SelectItem>
                        <SelectItem value="Net 60">Net 60</SelectItem>
                        <SelectItem value="Net 90">Net 90</SelectItem>
                        <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                        <SelectItem value="2/10 Net 30">2/10 Net 30</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Line Items Card */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Line Items</CardTitle>
                    <CardDescription>Products to order from this supplier</CardDescription>
                  </div>
                  <Button type="button" variant="outline" className="min-h-[44px]" onClick={addItemToForm}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {formData.items.length === 0 ? (
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <p className="text-muted-foreground">No items added yet</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={addItemToForm}
                    >
                      Add First Item
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {formData.items.map((item, index) => (
                      <div key={index} className="border rounded-lg p-6 space-y-6 bg-muted/30">
                        <div className="flex justify-between items-start">
                          <h4 className="font-medium">Item #{index + 1}</h4>
                          <Button
                            type="button"
                            variant="ghost"
                            className="min-h-[44px]"
                            onClick={() => removeItemFromForm(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Material Type</Label>
                            <Select
                              value={item.material_type_id}
                              onValueChange={(value) =>
                                updateItemInForm(index, 'material_type_id', value)
                              }
                            >
                              <SelectTrigger className="min-h-[44px]">
                                <SelectValue placeholder="Select material" />
                              </SelectTrigger>
                              <SelectContent>
                                {materialTypes.map(m => (
                                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Description</Label>
                            <Input
                              value={item.description}
                              onChange={(e) =>
                                updateItemInForm(index, 'description', e.target.value)
                              }
                              placeholder="Item description"
                              className="min-h-[44px]"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Quantity (sq ft)</Label>
                              <Input
                                type="number"
                                value={item.quantity_sqft}
                                onChange={(e) =>
                                  updateItemInForm(index, 'quantity_sqft', parseFloat(e.target.value) || 0)
                                }
                                className="min-h-[44px]"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Unit Cost ($/sq ft)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.unit_cost}
                                onChange={(e) =>
                                  updateItemInForm(index, 'unit_cost', parseFloat(e.target.value) || 0)
                                }
                                className="min-h-[44px]"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="text-right text-sm">
                          Line Total: <span className="font-mono font-semibold">
                            ${(item.quantity_sqft * item.unit_cost).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Addresses Card */}
            <Card>
              <CardHeader>
                <CardTitle>Addresses</CardTitle>
                <CardDescription>Shipping and billing information</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Shipping Address</Label>
                    <Textarea
                      value={formData.shipping_address}
                      onChange={(e) => setFormData({
                        ...formData,
                        shipping_address: e.target.value
                      })}
                      rows={4}
                      className="min-h-[100px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Billing Address</Label>
                    <Textarea
                      value={formData.billing_address}
                      onChange={(e) => setFormData({
                        ...formData,
                        billing_address: e.target.value
                      })}
                      rows={4}
                      className="min-h-[100px]"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes Card */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Information</CardTitle>
                <CardDescription>Notes and special instructions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes or instructions"
                    rows={4}
                    className="min-h-[100px]"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Order Summary */}
            {formData.items.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Order Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="font-mono">
                        ${formData.items.reduce((sum, item) =>
                          sum + (item.quantity_sqft * item.unit_cost), 0
                        ).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        Tax
                        {createFormTaxDetails && (
                          <span className="ml-1 text-xs text-gray-600">
                            ({taxService.formatTaxRate(createFormTaxDetails.taxRate)}{
                              createFormTaxDetails.taxLevel === 'exempt' ? ' - Tax Exempt' :
                              createFormTaxDetails.taxLevel === 'override' ? ' - Custom Rate' :
                              ''
                            })
                          </span>
                        )}
                      </span>
                      <span className="font-mono">
                        ${(formData.items.reduce((sum, item) =>
                          sum + (item.quantity_sqft * item.unit_cost), 0
                        ) * (createFormTaxDetails?.taxRate || 0.08)).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Shipping</span>
                      <span className="font-mono">
                        ${(suppliers.find(s => s.id === formData.supplier_id)?.default_shipping_cost || 50).toFixed(2)}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span className="font-mono">
                        ${(
                          formData.items.reduce((sum, item) =>
                            sum + (item.quantity_sqft * item.unit_cost), 0
                          ) * (1 + (createFormTaxDetails?.taxRate || 0.08)) +
                          (suppliers.find(s => s.id === formData.supplier_id)?.default_shipping_cost || 50)
                        ).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                // Reset form when canceling
                setFormData({
                  supplier_id: "",
                  requested_delivery_date: format(addDays(new Date(), 7), "yyyy-MM-dd"),
                  payment_terms: "Net 30",
                  shipping_address: "",
                  billing_address: "",
                  notes: "",
                  items: []
                });
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreatePO}
              disabled={isCreating || !formData.supplier_id || formData.items.length === 0}
            >
              {isCreating ? "Creating..." : "Create Purchase Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View PO Dialog */}
      {selectedPO && (
        <Dialog
          open={isViewDialogOpen}
          onOpenChange={(open) => {
            setIsViewDialogOpen(open);
            if (!open) {
              setSelectedPO(null);
            }
          }}
        >
          <DialogContent className="w-[95vw] max-w-[900px] max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header Area - PO number prominent with status badge and supplier */}
            <DialogHeader className="flex-shrink-0 pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <DialogTitle className="text-2xl font-bold tracking-tight">
                    PO #{selectedPO.po_number}
                  </DialogTitle>
                  <DialogDescription className="flex items-center gap-2 text-base">
                    <Building2 className="h-4 w-4 text-gray-400" />
                    <span className="font-medium text-[#111827]">{selectedPO.supplier?.name}</span>
                    {selectedPO.supplier?.city && selectedPO.supplier?.state && (
                      <span className="text-gray-500">
                        -- {selectedPO.supplier.city}, {selectedPO.supplier.state}
                      </span>
                    )}
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {getStatusBadge(selectedPO.status)}
                  {selectedPO.auto_generated && (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <ClipboardCheck className="h-3 w-3" />
                      Auto-generated
                    </Badge>
                  )}
                </div>
              </div>
            </DialogHeader>

            <Separator />

            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto px-1 -mx-1">
              <div className="space-y-5 pb-4 pt-2">

                {/* Order Details Card */}
                <Card>
                  <CardHeader className="pb-3 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Order Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">Order Date</Label>
                        <p className="text-sm font-medium">
                          {selectedPO.order_date
                            ? format(new Date(selectedPO.order_date), "MMM dd, yyyy")
                            : "--"
                          }
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">Requested Delivery</Label>
                        <p className="text-sm font-medium">
                          {selectedPO.requested_delivery_date
                            ? format(new Date(selectedPO.requested_delivery_date), "MMM dd, yyyy")
                            : "--"
                          }
                        </p>
                      </div>
                      {selectedPO.actual_delivery_date && (
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500">Actual Delivery</Label>
                          <p className="text-sm font-medium text-[#16A34A]">
                            {format(new Date(selectedPO.actual_delivery_date), "MMM dd, yyyy")}
                          </p>
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">Payment Terms</Label>
                        <p className="text-sm font-medium">
                          {selectedPO.payment_terms || "--"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">Status</Label>
                        <div>{getStatusBadge(selectedPO.status)}</div>
                      </div>
                    </div>

                    {/* Approval Info - shown only when approved */}
                    {selectedPO.approved_by && (
                      <>
                        <Separator className="my-4" />
                        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                          <CheckCircle className="h-5 w-5 text-[#16A34A] flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[#111827]">
                              Approved by {selectedPO.approved_by}
                            </p>
                            {selectedPO.approved_at && (
                              <p className="text-xs text-gray-500">
                                {format(new Date(selectedPO.approved_at), "MMM dd, yyyy 'at' h:mm a")}
                              </p>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Supplier Contact Card - shown if any contact info exists */}
                {(selectedPO.supplier?.contact_person || selectedPO.supplier?.email || selectedPO.supplier?.phone || selectedPO.supplier?.address) && (
                  <Card>
                    <CardHeader className="pb-3 pt-4 px-5">
                      <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Supplier Contact
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-4">
                      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                        {selectedPO.supplier?.contact_person && (
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm font-medium">{selectedPO.supplier.contact_person}</span>
                          </div>
                        )}
                        {selectedPO.supplier?.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm">{selectedPO.supplier.email}</span>
                          </div>
                        )}
                        {selectedPO.supplier?.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm">{selectedPO.supplier.phone}</span>
                          </div>
                        )}
                        {(selectedPO.supplier?.address || selectedPO.supplier?.city) && (
                          <div className="flex items-start gap-2 sm:col-span-2">
                            <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                            <span className="text-sm whitespace-pre-wrap">
                              {[
                                selectedPO.supplier.address,
                                [selectedPO.supplier.city, selectedPO.supplier.state, selectedPO.supplier.zip_code].filter(Boolean).join(", "),
                                selectedPO.supplier.country
                              ].filter(Boolean).join("\n")}
                            </span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Line Items Card */}
                <Card>
                  <CardHeader className="pb-3 pt-4 px-5">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Line Items
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {selectedPO.items?.length || 0} item{(selectedPO.items?.length || 0) !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    {/* Mobile view - Cards */}
                    <div className="sm:hidden space-y-3">
                      {selectedPO.items?.map((item) => (
                        <Card key={item.id} className="p-4 bg-gray-50 border-gray-200">
                          <div className="space-y-2">
                            <div className="flex justify-between items-start">
                              <span className="text-xs text-gray-500 font-medium">Item #{item.line_number}</span>
                              <Badge variant="outline" className="font-mono">
                                ${item.line_total.toFixed(2)}
                              </Badge>
                            </div>
                            <p className="font-medium text-sm">{item.description}</p>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-gray-500">Qty: </span>
                                <span className="font-mono">{item.quantity_sqft.toLocaleString()} sq ft</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Unit: </span>
                                <span className="font-mono">${item.unit_cost.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>

                    {/* Desktop view - Compact table */}
                    <div className="hidden sm:block">
                      <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50">
                              <TableHead className="w-10 px-3 font-semibold">#</TableHead>
                              <TableHead className="px-3 font-semibold">Description</TableHead>
                              <TableHead className="text-right px-3 w-28 font-semibold">Qty (sq ft)</TableHead>
                              <TableHead className="text-right px-3 w-24 font-semibold">Unit Cost</TableHead>
                              <TableHead className="text-right px-3 w-28 font-semibold">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedPO.items?.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-medium text-sm px-3">{item.line_number}</TableCell>
                                <TableCell className="text-sm px-3">
                                  <div className="min-w-0">
                                    <p className="truncate" title={item.description}>
                                      {item.description}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm px-3">
                                  {item.quantity_sqft.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm px-3">
                                  ${item.unit_cost.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right font-mono font-semibold text-sm px-3">
                                  ${item.line_total.toFixed(2)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Addresses Card - shown if either address exists */}
                {(selectedPO.shipping_address || selectedPO.billing_address) && (
                  <Card>
                    <CardHeader className="pb-3 pt-4 px-5">
                      <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Addresses
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-4">
                      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                        {selectedPO.shipping_address && (
                          <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-[#E5E7EB]">
                            <Label className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                              <Truck className="h-3.5 w-3.5" />
                              Shipping Address
                            </Label>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">
                              {selectedPO.shipping_address}
                            </p>
                          </div>
                        )}
                        {selectedPO.billing_address && (
                          <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-[#E5E7EB]">
                            <Label className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                              <FileText className="h-3.5 w-3.5" />
                              Billing Address
                            </Label>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">
                              {selectedPO.billing_address}
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Order Summary Card */}
                <Card className="border-[#E5E7EB]">
                  <CardHeader className="pb-3 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Order Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-4">
                    <div className="space-y-2.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Subtotal</span>
                        <span className="font-mono font-medium">${selectedPO.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">
                          Tax
                          {selectedPOTaxDetails && (
                            <span className="ml-1 text-xs text-gray-400">
                              ({taxService.formatTaxRate(selectedPOTaxDetails.taxRate)}{
                                selectedPOTaxDetails.taxLevel === 'exempt' ? ' - Tax Exempt' :
                                selectedPOTaxDetails.taxLevel === 'override' ? ' - Custom Rate' :
                                ''
                              })
                            </span>
                          )}
                        </span>
                        <span className="font-mono font-medium">${selectedPO.tax_amount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Shipping</span>
                        <span className="font-mono font-medium">${selectedPO.shipping_cost.toFixed(2)}</span>
                      </div>
                      <Separator className="my-1" />
                      <div className="flex justify-between items-center pt-1">
                        <span className="font-semibold text-lg text-[#111827]">Total</span>
                        <span className="font-mono font-bold text-xl text-[#2563EB]">
                          ${selectedPO.total_amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Notes Card - shown only if notes exist */}
                {selectedPO.notes && (
                  <Card>
                    <CardHeader className="pb-3 pt-4 px-5">
                      <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Notes
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-4">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed text-[#111827]">
                        {selectedPO.notes}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* Fixed footer - responsive button layout */}
            <DialogFooter className="flex-shrink-0 border-t pt-4 mt-0">
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsViewDialogOpen(false);
                    setSelectedPO(null);
                  }}
                  className="w-full sm:w-auto"
                >
                  Close
                </Button>
                {selectedPO.status === 'draft' && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setIsViewDialogOpen(false);
                        handleEditPO(selectedPO);
                      }}
                      className="w-full sm:w-auto"
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      onClick={async () => {
                        await updatePOStatus(selectedPO.id, 'pending');
                        setIsViewDialogOpen(false);
                        toast.success("Purchase order submitted for approval");
                      }}
                      className="w-full sm:w-auto"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Submit
                    </Button>
                  </>
                )}
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => handleDownloadPDF(selectedPO)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit PO Dialog */}
      {editingPO && (
        <Dialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) {
              setEditingPO(null);
              // Reset edit form when closing
              setEditFormData({
                supplier_id: "",
                requested_delivery_date: format(addDays(new Date(), 7), "yyyy-MM-dd"),
                payment_terms: "Net 30",
                shipping_address: "",
                billing_address: "",
                notes: "",
                items: []
              });
            }
          }}
        >
          <DialogContent className="w-[95vw] max-w-[900px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Purchase Order</DialogTitle>
              <DialogDescription>
                Edit PO #{editingPO.po_number} (Draft Status Only)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Supplier & Order Details Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Order Details</CardTitle>
                  <CardDescription>Basic information for this purchase order</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-6 grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="edit-supplier">Supplier *</Label>
                      <Select value={editFormData.supplier_id} onValueChange={(value) => {
                        // Update supplier and update addresses if they are still default/empty
                        const newSupplier = suppliers.find(s => s.id === value);
                        const buildAddress = (supplier: Supplier | undefined) => {
                          if (!supplier) return "";
                          const parts = [];
                          if (supplier.address) parts.push(supplier.address);
                          const cityStateZip = [
                            supplier.city,
                            supplier.state,
                            supplier.zip_code
                          ].filter(Boolean).join(" ");
                          if (cityStateZip) parts.push(cityStateZip);
                          if (supplier.country) parts.push(supplier.country);
                          return parts.join(", ") || "";
                        };
                        const newAddress = buildAddress(newSupplier);

                        setEditFormData({
                          ...editFormData,
                          supplier_id: value,
                          // Update addresses if they're empty or haven't been customized
                          shipping_address: editFormData.shipping_address || newAddress,
                          billing_address: editFormData.billing_address || newAddress
                        });
                      }}>
                        <SelectTrigger className="min-h-[44px]">
                          <SelectValue placeholder="Select supplier" />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {editFormData.supplier_id && (() => {
                        const selectedSupplier = suppliers.find(s => s.id === editFormData.supplier_id);
                        return selectedSupplier && (selectedSupplier.city || selectedSupplier.state) ? (
                          <p className="text-sm text-gray-600 mt-1">
                            <MapPin className="inline h-3 w-3 mr-1" />
                            {selectedSupplier.city && `${selectedSupplier.city}, `}
                            {selectedSupplier.state} {selectedSupplier.zip_code}
                            {selectedSupplier.tax_exempt && (
                              <Badge variant="outline" className="ml-2 text-xs">Tax Exempt</Badge>
                            )}
                          </p>
                        ) : null;
                      })()}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-delivery_date">Requested Delivery Date</Label>
                      <Input
                        type="date"
                        value={editFormData.requested_delivery_date}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          requested_delivery_date: e.target.value
                        })}
                        className="min-h-[44px]"
                      />
                    </div>
                  </div>

                  {/* Payment Terms */}
                  <div className="grid gap-6 grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="edit-payment_terms">Payment Terms</Label>
                      <Select value={editFormData.payment_terms} onValueChange={(value) =>
                        setEditFormData({ ...editFormData, payment_terms: value })
                      }>
                        <SelectTrigger className="min-h-[44px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Net 30">Net 30</SelectItem>
                          <SelectItem value="Net 60">Net 60</SelectItem>
                          <SelectItem value="Net 90">Net 90</SelectItem>
                          <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                          <SelectItem value="2/10 Net 30">2/10 Net 30</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Line Items Card */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Line Items</CardTitle>
                      <CardDescription>Products to order from this supplier</CardDescription>
                    </div>
                    <Button type="button" variant="outline" className="min-h-[44px]" onClick={addItemToEditForm}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Item
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>

                  {editFormData.items.length === 0 ? (
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <p className="text-muted-foreground">No items added yet</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={addItemToEditForm}
                    >
                      Add First Item
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {editFormData.items.map((item, index) => (
                      <div key={index} className="border rounded-lg p-6 space-y-6 bg-muted/30">
                        <div className="flex justify-between items-start">
                          <h4 className="font-medium">Item #{index + 1}</h4>
                          <Button
                            type="button"
                            variant="ghost"
                            className="min-h-[44px]"
                            onClick={() => removeItemFromEditForm(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Material Type</Label>
                            <Select
                              value={item.material_type_id}
                              onValueChange={(value) =>
                                updateItemInEditForm(index, 'material_type_id', value)
                              }
                            >
                              <SelectTrigger className="min-h-[44px]">
                                <SelectValue placeholder="Select material" />
                              </SelectTrigger>
                              <SelectContent>
                                {materialTypes.map(m => (
                                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Description</Label>
                            <Input
                              value={item.description}
                              onChange={(e) =>
                                updateItemInEditForm(index, 'description', e.target.value)
                              }
                              placeholder="Item description"
                              className="min-h-[44px]"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Quantity (sq ft)</Label>
                              <Input
                                type="number"
                                value={item.quantity_sqft}
                                onChange={(e) =>
                                  updateItemInEditForm(index, 'quantity_sqft', parseFloat(e.target.value) || 0)
                                }
                                className="min-h-[44px]"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Unit Cost ($/sq ft)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.unit_cost}
                                onChange={(e) =>
                                  updateItemInEditForm(index, 'unit_cost', parseFloat(e.target.value) || 0)
                                }
                                className="min-h-[44px]"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="text-right text-sm">
                          Line Total: <span className="font-mono font-semibold">
                            ${(item.quantity_sqft * item.unit_cost).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  )}
                </CardContent>
              </Card>

              {/* Addresses Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Addresses</CardTitle>
                  <CardDescription>Shipping and billing information</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 grid-cols-2">
                    <div className="space-y-2">
                      <Label>Shipping Address</Label>
                      <Textarea
                        value={editFormData.shipping_address}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          shipping_address: e.target.value
                        })}
                        rows={4}
                        className="min-h-[100px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Billing Address</Label>
                      <Textarea
                        value={editFormData.billing_address}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          billing_address: e.target.value
                        })}
                        rows={4}
                        className="min-h-[100px]"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Notes Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Additional Information</CardTitle>
                  <CardDescription>Notes and special instructions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={editFormData.notes}
                      onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                      placeholder="Additional notes or instructions"
                      rows={4}
                      className="min-h-[100px]"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Order Summary */}
              {editFormData.items.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Order Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span className="font-mono">
                          ${editFormData.items.reduce((sum, item) =>
                            sum + (item.quantity_sqft * item.unit_cost), 0
                          ).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tax ({((editFormTaxDetails?.taxRate || 0.08) * 100).toFixed(2)}%)</span>
                        <span className="font-mono">
                          ${(editFormData.items.reduce((sum, item) =>
                            sum + (item.quantity_sqft * item.unit_cost), 0
                          ) * (editFormTaxDetails?.taxRate || 0.08)).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Shipping</span>
                        <span className="font-mono">$50.00</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-semibold">
                        <span>Total</span>
                        <span className="font-mono">
                          ${(
                            editFormData.items.reduce((sum, item) =>
                              sum + (item.quantity_sqft * item.unit_cost), 0
                            ) * (1 + (editFormTaxDetails?.taxRate || 0.08)) + 50
                          ).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setEditingPO(null);
                  // Reset form when canceling
                  setEditFormData({
                    supplier_id: "",
                    requested_delivery_date: format(addDays(new Date(), 7), "yyyy-MM-dd"),
                    payment_terms: "Net 30",
                    shipping_address: "",
                    billing_address: "",
                    notes: "",
                    items: []
                  });
                }}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdatePO}
                disabled={isUpdating || !editFormData.supplier_id || editFormData.items.length === 0}
              >
                {isUpdating ? "Updating..." : "Update Purchase Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        open={confirmAction.open}
        onOpenChange={(open) => setConfirmAction({ ...confirmAction, open })}
        onConfirm={confirmAction.action}
        title={confirmAction.title}
        description={confirmAction.description}
        variant={confirmAction.variant}
      />
    </div>
  );
}