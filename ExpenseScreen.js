import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

export default function ExpenseScreen() {
  const db = useSQLiteContext();

  const [expenses, setExpenses] = useState([]);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'week' | 'month'
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editDate, setEditDate] = useState('');

   const loadExpenses = async () => {
    const rows = await db.getAllAsync(
      'SELECT * FROM expenses ORDER BY id DESC;'
    );
    setExpenses(rows);
  };

  const addExpense = async () => {
    const amountNumber = parseFloat(amount);

    if (isNaN(amountNumber) || amountNumber <= 0) {
      // Basic validation: ignore invalid or non-positive amounts
      return;
    }

    const trimmedCategory = category.trim();
    const trimmedNote = note.trim();
    const trimmedDate = date.trim();

    if (!trimmedCategory) {
      // Category is required
      return;
    }

    // Normalize the entered date into ISO YYYY-MM-DD when possible.
    let isoDate = null;
    if (trimmedDate) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
        isoDate = trimmedDate; // already ISO
      } else if (/^\d+$/.test(trimmedDate)) {
        // numeric only: treat as epoch seconds (10) or ms (13)
        const num = Number(trimmedDate);
        let ms = num;
        if (String(num).length === 10) ms = num * 1000;
        const d = new Date(ms);
        if (!isNaN(d.getTime())) isoDate = d.toISOString().slice(0, 10);
      } else {
        const parsed = Date.parse(trimmedDate);
        if (!isNaN(parsed)) isoDate = new Date(parsed).toISOString().slice(0, 10);
      }
    }

    await db.runAsync(
      'INSERT INTO expenses (amount, category, note, date) VALUES (?, ?, ?, ?);',
      [amountNumber, trimmedCategory, trimmedNote || null, isoDate || null]
    );

    setAmount('');
    setCategory('');
    setNote('');
    setDate('');

    loadExpenses();
  };

  const deleteExpense = async (id) => {
    await db.runAsync('DELETE FROM expenses WHERE id = ?;', [id]);
    loadExpenses();
  };

  const openEdit = (item) => {
    setEditItem(item);
    setEditAmount(item.amount ? String(item.amount) : '');
    setEditCategory(item.category || '');
    setEditNote(item.note || '');
    setEditDate(item.date || '');
  };

  const cancelEdit = () => {
    setEditItem(null);
    setEditAmount('');
    setEditCategory('');
    setEditNote('');
    setEditDate('');
  };

  const updateExpense = async () => {
    if (!editItem) return;
    const amountNumber = parseFloat(editAmount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      // ignore invalid amounts
      return;
    }
    const trimmedCategory = (editCategory || '').trim();
    if (!trimmedCategory) {
      // Category is required (same validation as add flow)
      return;
    }
    const trimmedNote = (editNote || '').trim();
    const isoDate = normalizeToISO(editDate);

    await db.runAsync(
      'UPDATE expenses SET amount = ?, category = ?, note = ?, date = ? WHERE id = ?;',
      [amountNumber, trimmedCategory || null, trimmedNote || null, isoDate || null, editItem.id]
    );

    cancelEdit();
    loadExpenses();
  };

  // Helper to format numeric input into YYYY-MM-DD as the user types.
  // Accepts a string (possibly containing non-digits), extracts digits,
  // and inserts dashes after year and month. Keeps up to 8 digits.
  const formatDateInput = (raw) => {
    const digits = String(raw).replace(/\D/g, '').slice(0, 8); // YYYYMMDD
    const y = digits.slice(0, 4);
    const m = digits.slice(4, 6);
    const d = digits.slice(6, 8);
    let out = y;
    if (m) out += '-' + m;
    if (d) out += '-' + d;
    return out;
  };

  // Normalize a date string into ISO YYYY-MM-DD if possible
  const normalizeToISO = (raw) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      let ms = num;
      if (String(num).length === 10) ms = num * 1000;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      return null;
    }
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
    return null;
  };

  // Helper: parse a stored date (ISO string or epoch) into a JS Date or null
  const parseStoredDate = (d) => {
    if (!d && d !== 0) return null;
    if (typeof d === 'number') {
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? null : dt;
    }
    // strings: try Date.parse
    const parsed = Date.parse(String(d));
    if (!isNaN(parsed)) return new Date(parsed);
    return null;
  };

  const applyFilter = (items) => {
    if (!items || !items.length) return items;
    if (filter === 'all') return items;

    const now = new Date();
    // start of today at 00:00:00
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (filter === 'week') {
      // Start of week (Sunday)
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);

      return items.filter((it) => {
        const d = parseStoredDate(it.date);
        if (!d) return false;
        return d >= startOfWeek && d < endOfWeek;
      });
    }

    if (filter === 'month') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      return items.filter((it) => {
        const d = parseStoredDate(it.date);
        if (!d) return false;
        return d >= startOfMonth && d < startOfNextMonth;
      });
    }

    return items;
  };

  // Wrap applyFilter to include selectedCategory filtering
  const applyFiltersWithCategory = (items) => {
    const dateFiltered = applyFilter(items) || [];
    if (!selectedCategory) return dateFiltered;
    return dateFiltered.filter((it) => {
      if (!it || !it.category) return false;
      return String(it.category).trim() === String(selectedCategory).trim();
    });
  };

   const renderExpense = ({ item }) => (
    <View style={styles.expenseRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.expenseAmount}>${Number(item.amount).toFixed(2)}</Text>
        <Text style={styles.expenseCategory}>{item.category}</Text>
        {item.note ? <Text style={styles.expenseNote}>{item.note}</Text> : null}
        {item.date ? <Text style={styles.expenseDate}>{item.date}</Text> : null}
      </View>
      <TouchableOpacity onPress={() => openEdit(item)}>
        <Text style={styles.edit}>Edit</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => deleteExpense(item.id)}>
        <Text style={styles.delete}>✕</Text>
      </TouchableOpacity>
    </View>
  );



useEffect(() => {
    async function setup() {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          amount REAL NOT NULL,
          category TEXT NOT NULL,
          note TEXT,
          date TEXT
        );
      `);

      // Ensure older DBs get the `date` column added if missing and migrate existing values
      try {
        const cols = await db.getAllAsync("PRAGMA table_info(expenses);");
        const hasDate = cols && cols.find((c) => c.name === 'date');
        if (!hasDate) {
          await db.execAsync('ALTER TABLE expenses ADD COLUMN date TEXT;');
        }

        // Migrate existing date values into ISO YYYY-MM-DD strings when possible.
        const rows = await db.getAllAsync('SELECT id, date FROM expenses WHERE date IS NOT NULL;');
        for (const r of rows) {
          if (!r.date) continue;
          let iso = null;
          if (typeof r.date === 'number') {
            const d = new Date(r.date);
            if (!isNaN(d.getTime())) iso = d.toISOString().slice(0, 10);
          } else if (/^\d+$/.test(String(r.date))) {
            const num = Number(r.date);
            let ms = num;
            if (String(num).length === 10) ms = num * 1000;
            const d = new Date(ms);
            if (!isNaN(d.getTime())) iso = d.toISOString().slice(0, 10);
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
            iso = r.date;
          } else {
            const parsed = Date.parse(r.date);
            if (!isNaN(parsed)) iso = new Date(parsed).toISOString().slice(0, 10);
          }

          if (iso && iso !== String(r.date)) {
            try {
              await db.runAsync('UPDATE expenses SET date = ? WHERE id = ?;', [iso, r.id]);
            } catch (e) {
              // ignore individual update errors
            }
          }
        }
      } catch (e) {
        // Ignore errors from pragma/alter/migration on very old sqlite wrappers
      }

      await loadExpenses();
    }

    setup();
  }, []);

  // compute visible items and total for current filter and optional category
  const visibleExpenses = (function () {
    try {
      return applyFiltersWithCategory(expenses) || [];
    } catch (e) {
      return expenses || [];
    }
  })();

  const total = (function () {
    try {
      return visibleExpenses.reduce((acc, it) => {
        const n = Number(it && it.amount ? it.amount : 0);
        return acc + (isNaN(n) ? 0 : n);
      }, 0);
    } catch (e) {
      return 0;
    }
  })();

  // Compute totals grouped by category for the currently visible expenses
  const categoryTotals = (function () {
    try {
      const map = {};
      for (const it of visibleExpenses) {
        const cat = it && it.category ? String(it.category) : 'Uncategorized';
        const n = Number(it && it.amount ? it.amount : 0);
        map[cat] = (map[cat] || 0) + (isNaN(n) ? 0 : n);
      }
      return Object.entries(map)
        .map(([category, sum]) => ({ category, sum }))
        .sort((a, b) => b.sum - a.sum);
    } catch (e) {
      return [];
    }
  })();



return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Student Expense Tracker</Text>

      {selectedCategory ? (
        <View style={styles.selectedCategoryPill}>
          <Text style={styles.selectedCategoryText}>{selectedCategory}</Text>
          <TouchableOpacity onPress={() => setSelectedCategory(null)}>
            <Text style={styles.selectedCategoryClear}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={filter === 'all' ? styles.filterTextActive : styles.filterText}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'week' && styles.filterButtonActive]}
          onPress={() => setFilter('week')}
        >
          <Text style={filter === 'week' ? styles.filterTextActive : styles.filterText}>This Week</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'month' && styles.filterButtonActive]}
          onPress={() => setFilter('month')}
        >
          <Text style={filter === 'month' ? styles.filterTextActive : styles.filterText}>This Month</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Amount (e.g. 12.50)"
          placeholderTextColor="#9ca3af"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />
        <TextInput
          style={styles.input}
          placeholder="Category (Food, Books, Rent...)"
          placeholderTextColor="#9ca3af"
          value={category}
          onChangeText={setCategory}
        />
        <TextInput
          style={styles.input}
          placeholder="Note (optional)"
          placeholderTextColor="#9ca3af"
          value={note}
          onChangeText={setNote}
        />

        <TextInput
          style={styles.input}
          placeholder="Date (YYYY-MM-DD)"
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
          maxLength={10}
          value={date}
          onChangeText={(t) => setDate(formatDateInput(t))}
        />
        <Button title="Add Expense" onPress={addExpense} />
      </View>

      

      <FlatList
        data={visibleExpenses}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderExpense}
        ListEmptyComponent={
          <Text style={styles.empty}>No expenses yet.</Text>
        }
      />

      <Modal visible={!!editItem} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Expense</Text>

            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              value={editAmount}
              onChangeText={setEditAmount}
            />

            <TextInput
              style={styles.input}
              placeholder="Category"
              placeholderTextColor="#9ca3af"
              value={editCategory}
              onChangeText={setEditCategory}
            />

            <TextInput
              style={styles.input}
              placeholder="Note (optional)"
              placeholderTextColor="#9ca3af"
              value={editNote}
              onChangeText={setEditNote}
            />

            <TextInput
              style={styles.input}
              placeholder="Date (YYYY-MM-DD)"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              maxLength={10}
              value={editDate}
              onChangeText={(t) => setEditDate(formatDateInput(t))}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButton} onPress={cancelEdit}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#10b981' }]} onPress={updateExpense}>
                <Text style={styles.modalButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total ({filter === 'all' ? 'All' : filter === 'week' ? 'This week' : 'This month'}):</Text>
        <Text style={styles.totalAmount}>${total.toFixed(2)}</Text>
      </View>

      {/* By Category summary moved to the bottom, same style area as total */}
      {categoryTotals && categoryTotals.length > 0 ? (
        <View style={styles.categorySummaryBlock}>
          <Text style={styles.categorySummaryHeader}>By Category ({filter === 'all' ? 'All' : filter === 'week' ? 'This Week' : 'This Month'}):</Text>
          {categoryTotals.map((ct) => (
            <TouchableOpacity key={ct.category} onPress={() => setSelectedCategory(ct.category)}>
              <Text style={styles.categorySummaryLine}>• {ct.category}: ${ct.sum.toFixed(2)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <Text style={styles.footer}>
        Enter your expenses and they’ll be saved locally with SQLite.
      </Text>
    </SafeAreaView>
  );
}
  const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#111827' },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  form: {
    marginBottom: 16,
    gap: 8,
  },
  input: {
    padding: 10,
    backgroundColor: '#1f2937',
    color: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  expenseAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fbbf24',
  },
  expenseCategory: {
    fontSize: 14,
    color: '#e5e7eb',
  },
  expenseNote: {
    fontSize: 12,
    color: '#9ca3af',
  },
  expenseDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#0b1220',
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  totalLabel: {
    color: '#e5e7eb',
    fontSize: 14,
  },
  totalAmount: {
    color: '#fbbf24',
    fontSize: 16,
    fontWeight: '700',
  },
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    marginHorizontal: 4,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  filterButtonActive: {
    backgroundColor: '#374151',
    borderColor: '#6b7280',
  },
  filterText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  filterTextActive: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  delete: {
    color: '#f87171',
    fontSize: 20,
    marginLeft: 12,
  },
  edit: {
    color: '#60a5fa',
    fontSize: 18,
    marginLeft: 8,
    marginRight: 8,
  },
  empty: {
    color: '#9ca3af',
    marginTop: 24,
    textAlign: 'center',
  },
  footer: {
    textAlign: 'center',
    color: '#6b7280',
    marginTop: 12,
    fontSize: 12,
  },
  categorySummaryBlock: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: '#0f172a',
    borderRadius: 8,
  },
  categorySummaryHeader: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  categorySummaryLine: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 4,
  },
  selectedCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 8,
  },
  selectedCategoryText: {
    color: '#e5e7eb',
    marginRight: 8,
    fontWeight: '600',
  },
  selectedCategoryClear: {
    color: '#f87171',
    fontWeight: '700',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#0b1220',
    padding: 16,
    borderRadius: 12,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#374151',
    borderRadius: 8,
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});