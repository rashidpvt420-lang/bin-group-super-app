import { detectContractMode } from './ownerServiceMode';

export interface OwnerFinancialState {
  hasRentData: boolean;
  annualContractValue: number;
  mobilizationAmount: number;
  paymentStatus: string;
  totalPaid: number;
  totalPending: number;
  totalMaintenanceCost: number;
  estimatedOwnerRoi: number;
  netPropertyPosition: number;
  upcomingInvoiceAmount: number | null;
  totalSlaCredits: number;
  totalPenalties: number;
  propertyCosts: Record<string, number>;
  monthlyCosts: Record<string, number>;
  complaintCostImpact: number;
  propertiesWithRent: number;
  totalProperties: number;
  expectedAnnualRent: number;
  ownerNetIncome: number;
  contractMode: string;
}

export function resolveOwnerFinancials(
  contract: any,
  properties: any[],
  invoices: any[],
  payments: any[],
  maintenanceTickets: any[]
): OwnerFinancialState {
  const contractMode = detectContractMode(contract);
  const annualContractValue = Number(contract?.annualValue || contract?.contractValue || contract?.totalValue || contract?.annualContractValue || 0);
  const mobilizationAmount = Number(contract?.mobilizationAmount || contract?.depositAmount || (annualContractValue * 0.15));
  const paymentStatus = String(contract?.paymentStatus || 'PENDING').toUpperCase();

  let totalPaid = 0;
  let totalPending = 0;

  for (const payment of payments) {
    if (String(payment.status).toUpperCase() === 'PAID' || String(payment.status).toUpperCase() === 'COMPLETED' || String(payment.status).toUpperCase() === 'SUCCESS') {
      totalPaid += Number(payment.amount || 0);
    } else {
      totalPending += Number(payment.amount || 0);
    }
  }
  
  if (totalPaid === 0 && paymentStatus === 'PAID') {
    totalPaid = mobilizationAmount; // Fallback if no specific payment records but contract is PAID
  }

  let totalMaintenanceCost = 0;
  let totalSlaCredits = 0;
  let totalPenalties = 0;
  let complaintCostImpact = 0;
  
  const propertyCosts: Record<string, number> = {};
  const monthlyCosts: Record<string, number> = {};

  for (const ticket of maintenanceTickets) {
    const cost = Number(ticket.cost || ticket.invoiceAmount || ticket.finalCost || 0);
    const slaCredit = Number(ticket.slaCredit || 0);
    const penalty = Number(ticket.penalty || 0);
    
    totalMaintenanceCost += cost;
    totalSlaCredits += slaCredit;
    totalPenalties += penalty;
    
    if (cost > 0) {
      complaintCostImpact += cost;
      const propId = String(ticket.propertyId || 'Unknown');
      propertyCosts[propId] = (propertyCosts[propId] || 0) + cost;
      
      const date = ticket.resolvedAt || ticket.updatedAt || ticket.createdAt;
      if (date && (date.seconds || date._seconds)) {
        const d = new Date((date.seconds || date._seconds) * 1000);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyCosts[monthKey] = (monthlyCosts[monthKey] || 0) + cost;
      }
    }
  }

  let hasRentData = false;
  let expectedAnnualRent = 0;
  let propertiesWithRent = 0;

  for (const property of properties) {
    const rent = Number(property.rent || property.annualRent || property.expectedRent || 0);
    if (rent > 0) {
      hasRentData = true;
      expectedAnnualRent += rent;
      propertiesWithRent++;
    }
  }

  // ROI / Net Income calculations depend on contract mode
  const estimatedOwnerRoi = hasRentData ? (expectedAnnualRent - annualContractValue - totalMaintenanceCost) : 0;
  const netPropertyPosition = estimatedOwnerRoi + totalSlaCredits - totalPenalties;
  const ownerNetIncome = estimatedOwnerRoi;
  
  const upcomingInvoice = invoices.find(i => String(i.status).toUpperCase() === 'PENDING' || String(i.status).toUpperCase() === 'UPCOMING');
  const upcomingInvoiceAmount = upcomingInvoice ? Number(upcomingInvoice.amount || upcomingInvoice.total || 0) : null;

  return {
    hasRentData,
    annualContractValue,
    mobilizationAmount,
    paymentStatus,
    totalPaid,
    totalPending,
    totalMaintenanceCost,
    estimatedOwnerRoi,
    netPropertyPosition,
    upcomingInvoiceAmount,
    totalSlaCredits,
    totalPenalties,
    propertyCosts,
    monthlyCosts,
    complaintCostImpact,
    propertiesWithRent,
    totalProperties: properties.length,
    expectedAnnualRent,
    ownerNetIncome,
    contractMode
  };
}
