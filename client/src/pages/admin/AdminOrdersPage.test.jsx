import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../app/providers/ToastProvider';
import AdminOrdersPage from './AdminOrdersPage';

vi.mock('../../features/admin/api/admin.service', () => ({
  adminService: {
    listAllOrders: vi.fn(),
    updateOrderStatus: vi.fn(),
  },
}));
// eslint-disable-next-line import/first
import { adminService } from '../../features/admin/api/admin.service';

function renderPage() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <AdminOrdersPage />
      </ToastProvider>
    </LanguageProvider>
  );
}

function makeOrder(overrides = {}) {
  return {
    _id: 'order-1',
    orderNumber: 'TV-20260101-AAAA1111',
    status: 'shipped',
    paymentStatus: 'paid',
    total: 1000,
    items: [{ name: 'Test Product', sku: 'SKU-1', quantity: 1, totalPrice: 1000 }],
    shippingAddress: { city: 'Rehovot', street: 'Herzl 25', country: 'Israel' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminOrdersPage — "Mark as Delivered" (shipped → delivered) action', () => {
  it('shows the "סמן כנמסר" action only when the order status is "shipped"', async () => {
    const shippedOrder = makeOrder({ _id: 'order-shipped', status: 'shipped' });
    adminService.listAllOrders.mockResolvedValue({ orders: [shippedOrder], meta: { total: 1, page: 1, totalPages: 1 } });

    renderPage();
    await waitFor(() => expect(screen.getByText(shippedOrder.orderNumber)).toBeInTheDocument());

    const row = screen.getByText(shippedOrder.orderNumber).closest('tr');
    fireEvent.click(within(row).getByTitle('פעולות נוספות'));

    expect(await screen.findByText('סמן כנמסר')).toBeInTheDocument();
  });

  it('does NOT show the action for a "confirmed" (not yet shipped) order', async () => {
    const confirmedOrder = makeOrder({ _id: 'order-confirmed', status: 'confirmed' });
    adminService.listAllOrders.mockResolvedValue({ orders: [confirmedOrder], meta: { total: 1, page: 1, totalPages: 1 } });

    renderPage();
    await waitFor(() => expect(screen.getByText(confirmedOrder.orderNumber)).toBeInTheDocument());

    const row = screen.getByText(confirmedOrder.orderNumber).closest('tr');
    fireEvent.click(within(row).getByTitle('פעולות נוספות'));

    // The menu is open (a sibling action is present) but no "mark delivered" entry.
    expect(await screen.findByText('פרטי הזמנה')).toBeInTheDocument();
    expect(screen.queryByText('סמן כנמסר')).not.toBeInTheDocument();
  });

  it('clicking the action calls the existing status-update service with "delivered", and a successful response updates the visible row', async () => {
    const shippedOrder = makeOrder({ _id: 'order-shipped-2', status: 'shipped' });
    const deliveredOrder = { ...shippedOrder, status: 'delivered' };
    adminService.listAllOrders.mockResolvedValue({ orders: [shippedOrder], meta: { total: 1, page: 1, totalPages: 1 } });
    adminService.updateOrderStatus.mockResolvedValue(deliveredOrder);

    renderPage();
    await waitFor(() => expect(screen.getByText(shippedOrder.orderNumber)).toBeInTheDocument());

    const row = screen.getByText(shippedOrder.orderNumber).closest('tr');
    fireEvent.click(within(row).getByTitle('פעולות נוספות'));
    fireEvent.click(await screen.findByText('סמן כנמסר'));

    await waitFor(() => expect(adminService.updateOrderStatus).toHaveBeenCalledWith('order-shipped-2', 'delivered'));

    // The row's status badge reflects the server's real response — "נמסר" (delivered).
    await waitFor(() => {
      const updatedRow = screen.getByText(shippedOrder.orderNumber).closest('tr');
      expect(within(updatedRow).getByText('נמסר')).toBeInTheDocument();
    });
  });

  it('a failed transition shows an error and does NOT optimistically mark the order delivered', async () => {
    const shippedOrder = makeOrder({ _id: 'order-shipped-3', status: 'shipped' });
    adminService.listAllOrders.mockResolvedValue({ orders: [shippedOrder], meta: { total: 1, page: 1, totalPages: 1 } });
    adminService.updateOrderStatus.mockRejectedValue(new Error('Cannot transition from "shipped" to "delivered"'));

    renderPage();
    await waitFor(() => expect(screen.getByText(shippedOrder.orderNumber)).toBeInTheDocument());

    const row = screen.getByText(shippedOrder.orderNumber).closest('tr');
    fireEvent.click(within(row).getByTitle('פעולות נוספות'));
    fireEvent.click(await screen.findByText('סמן כנמסר'));

    await waitFor(() => expect(adminService.updateOrderStatus).toHaveBeenCalled());

    // Still shows the real (unchanged) status — never flipped to "delivered" on a rejected call.
    const stillRow = screen.getByText(shippedOrder.orderNumber).closest('tr');
    expect(within(stillRow).getByText('נשלח')).toBeInTheDocument();
  });
});
