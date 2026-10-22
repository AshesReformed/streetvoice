'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { useApi } from '@/lib/hooks/use-api'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Department } from '@/lib/types'

interface DepartmentForm {
  name: string
  nameUr: string
  smsNumber: string
  supervisorNumber: string
  description: string
  keywords: string
}

const EMPTY_FORM: DepartmentForm = {
  name: '',
  nameUr: '',
  smsNumber: '',
  supervisorNumber: '',
  description: '',
  keywords: '',
}

function toForm(dept: Department): DepartmentForm {
  return {
    name: dept.name,
    nameUr: dept.name_ur || '',
    smsNumber: dept.sms_number || '',
    supervisorNumber: dept.supervisor_sms_number || '',
    description: dept.description || '',
    keywords: dept.keywords.join(', '),
  }
}

function toPayload(form: DepartmentForm) {
  return {
    name: form.name.trim(),
    name_ur: form.nameUr.trim() || null,
    sms_number: form.smsNumber.trim() || null,
    supervisor_sms_number: form.supervisorNumber.trim() || null,
    description: form.description.trim() || null,
    keywords: form.keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
  }
}

function DepartmentFields({
  form,
  onChange,
}: {
  form: DepartmentForm
  onChange: (form: DepartmentForm) => void
}) {
  const set = (key: keyof DepartmentForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...form, [key]: e.target.value })

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <Input placeholder="e.g. Electricity" value={form.name} onChange={set('name')} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Name in Urdu (for SMS)</label>
          <Input dir="rtl" placeholder="مثلاً بجلی" value={form.nameUr} onChange={set('nameUr')} />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">SMS number</label>
        <Input placeholder="e.g. 0300 1234567" value={form.smsNumber} onChange={set('smsNumber')} />
        <p className="text-xs text-muted-foreground">
          New complaints are sent here in Urdu. Replies from this number (&quot;482913 DONE&quot;) update the complaint.
        </p>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Supervisor SMS number (optional)</label>
        <Input placeholder="e.g. 0321 7654321" value={form.supervisorNumber} onChange={set('supervisorNumber')} />
        <p className="text-xs text-muted-foreground">
          Told when a complaint is still not resolved after a week. Without one, the control room&apos;s alert
          numbers are told.
        </p>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">What this department handles</label>
        <textarea
          rows={3}
          placeholder="e.g. Power outages, load-shedding, sparking transformers, fallen wires, meters and bills."
          value={form.description}
          onChange={set('description')}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">The AI reads this to decide which complaints belong here.</p>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Fallback keywords (comma-separated)</label>
        <Input placeholder="e.g. power, outage, transformer" value={form.keywords} onChange={set('keywords')} />
      </div>
    </div>
  )
}

export default function DepartmentsPage() {
  const {
    data: departmentsData,
    loading,
    error,
    reload: reloadDepartments,
  } = useApi<Department[]>('/api/departments')
  const departments = departmentsData ?? []

  // Add / edit dialog: editingDept is null when adding
  const [formOpen, setFormOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [form, setForm] = useState<DepartmentForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Delete confirmation state
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingDept, setDeletingDept] = useState<Department | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  function openAdd() {
    setEditingDept(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setFormOpen(true)
  }

  function openEdit(dept: Department) {
    setEditingDept(dept)
    setForm(toForm(dept))
    setFormError('')
    setFormOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setFormError('Name is required')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const res = await fetch(editingDept ? `/api/departments/${editingDept.id}` : '/api/departments', {
        method: editingDept ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(form)),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to save')
      }
      setFormOpen(false)
      setEditingDept(null)
      reloadDepartments()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  function openDelete(dept: Department) {
    setDeletingDept(dept)
    setDeleteError('')
    setDeleteOpen(true)
  }

  async function handleDelete() {
    if (!deletingDept) return
    setDeleteSaving(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/departments/${deletingDept.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to delete')
      }
      setDeleteOpen(false)
      setDeletingDept(null)
      reloadDepartments()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Error')
    } finally {
      setDeleteSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        description="Where complaints go: each department receives its complaints by SMS"
      >
        <Button size="sm" onClick={openAdd}>
          <Plus size={14} />
          Add Department
        </Button>
      </PageHeader>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SMS number</TableHead>
                  <TableHead>What it handles</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No departments yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  departments.map((dept) => (
                    <TableRow key={dept.id}>
                      <TableCell className="font-medium">
                        {dept.name}
                        {dept.name_ur && (
                          <span dir="rtl" className="block text-xs font-normal text-muted-foreground">
                            {dept.name_ur}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {dept.sms_number || (
                          <span className="font-sans text-amber-700">Not set: complaints are not sent</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-md whitespace-normal text-xs text-muted-foreground">
                        {dept.description || dept.keywords.join(', ') || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon-xs" onClick={() => openEdit(dept)}>
                            <Pencil size={14} />
                          </Button>
                          {dept.name !== 'General/Unclassified' && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="text-destructive hover:text-destructive"
                              onClick={() => openDelete(dept)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDept ? 'Edit Department' : 'Add Department'}</DialogTitle>
            <DialogDescription>
              {editingDept ? 'Update department details.' : 'Create a new department for complaint routing.'}
            </DialogDescription>
          </DialogHeader>
          <DepartmentFields form={form} onChange={setForm} />
          {formError && (
            <p className="text-xs text-destructive">{formError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingDept ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Department</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deletingDept?.name}</strong>? Complaints assigned to this department will become unassigned. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-xs text-destructive">{deleteError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteSaving}>
              {deleteSaving ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
