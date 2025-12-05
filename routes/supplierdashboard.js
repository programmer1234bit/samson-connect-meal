// ==================== Supplier Dashboard JS ====================
let allOrders = [];

// ⚠️ IMPORTANT: supplierId should come from secure login session
let supplierId = localStorage.getItem('supplierId') || '';

// --- UI References ---
const supplierInput = document.getElementById('supplierId');
const connectBtn = document.getElementById('connectBtn');

const pendingOrdersTbody = document.getElementById('pendingOrdersTbody');
const confirmedOrdersTbody = document.getElementById('confirmedOrdersTbody');
const pendingSearchInput = document.getElementById('pendingSearch');
const confirmedSearchInput = document.getElementById('confirmedSearch');

const statConfirmedToday = document.getElementById('statConfirmedToday');
const statPending = document.getElementById('statPending');
const statTotal = document.getElementById('statTotal');

// ==================== Socket.io ====================
const socket = io('http://localhost:5000');

if (supplierId) {
    socket.emit('joinSupplier', supplierId);
}

// Listen for real-time confirmed orders
socket.on('orderConfirmed', (order) => {
    if (order.supplier_id === supplierId) {
        console.log('📦 New confirmed order received:', order);
        fetchAndRenderAll();
    }
});

// ==================== Helper Functions ====================
function fmtMoney(v) {
    const n = Number(v ?? 0);
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'TZS' }).format(n);
}

function updateStats() {
    if (!supplierId) return;
    fetch(`http://localhost:5000/api/orders?supplierId=${encodeURIComponent(supplierId)}`)
      .then(res => res.json())
      .then(s => {
          const pending = s.filter(o => o.status === 'Pending').length;
          const confirmed = s.filter(o => o.status === 'Confirmed').length;
          const total = s.length;

          statConfirmedToday.textContent = confirmed;
          statPending.textContent = pending;
          statTotal.textContent = total;
      })
      .catch(e => console.error('Error fetching stats:', e));
}

// ==================== Main Functions ====================
async function fetchAndRenderAll() {
    if (!supplierId) return;

    try {
        const res = await fetch(`http://localhost:5000/api/orders?supplierId=${encodeURIComponent(supplierId)}`);
        allOrders = await res.json();

        updateStats();
        renderPendingOrders();
        renderConfirmedOrders();

    } catch (err) {
        console.error('❌ Error fetching supplier orders:', err);
        alert('Error fetching orders ❌');
    }
}

function renderPendingOrders() {
    const searchValue = pendingSearchInput.value.toLowerCase();
    const pending = allOrders.filter(order => 
        order.status === 'Pending' && 
        order.customer.toLowerCase().includes(searchValue)
    );
    renderOrders(pending, pendingOrdersTbody, 'Pending');
}

function renderConfirmedOrders() {
    const searchValue = confirmedSearchInput.value.toLowerCase();
    const confirmed = allOrders.filter(order => 
        order.status === 'Confirmed' && 
        order.customer.toLowerCase().includes(searchValue)
    );
    renderOrders(confirmed, confirmedOrdersTbody, 'Confirmed');
}

function renderOrders(orders, tbody, status) {
    tbody.innerHTML = '';
    if (orders.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="6" style="text-align:center; padding:20px;">No ${status.toLowerCase()} orders found.</td>`;
        tbody.appendChild(tr);
        return;
    }

    orders.forEach(order => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${order.id}</td>
            <td>${order.customer}</td>
            <td>${fmtMoney(order.total_price)}</td>
            <td>${order.meal}</td>
            <td>${order.status}</td>
            <td>
                ${order.status === 'Pending' ? `<button class="btn btn-complete" onclick="updateStatus('${order.id}', 'Confirmed')">Complete</button>` : ''}
                ${order.status === 'Pending' ? `<button class="btn btn-cancel" onclick="updateStatus('${order.id}', 'Cancelled')">Cancel</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==================== Action Handlers ====================
async function updateStatus(id, status) {
    try {
        const res = await fetch(`http://localhost:5000/api/orders/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });

        if (res.ok) {
            alert(`Order status updated to ${status} ✅`);
            fetchAndRenderAll();
        } else {
            const data = await res.json();
            alert(`Failed to update order ❌: ${data.error || ''}`);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to update order ❌');
    }
}

// ==================== Event Listeners ====================
connectBtn?.addEventListener('click', () => {
    supplierId = supplierInput.value.trim();
    if (supplierId) {
        localStorage.setItem('supplierId', supplierId);
        socket.emit('joinSupplier', supplierId);
        fetchAndRenderAll();
    } else {
        alert('Please enter a Supplier ID.');
    }
});

pendingSearchInput.addEventListener('input', renderPendingOrders);
confirmedSearchInput.addEventListener('input', renderConfirmedOrders);

// ==================== Initial Call ====================
if (supplierId) {
    supplierInput.value = supplierId;
    socket.emit('joinSupplier', supplierId);
    fetchAndRenderAll();
}
