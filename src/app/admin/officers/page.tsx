'use client'

import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { PageHeader } from '@/components/page-header'
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
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Officer, Department } from '@/lib/types'

export default function OfficersPage() {
  const [officers, setOfficers] = useState<Officer[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog state
  const [addOpen, setAddOpen] = useState(false)
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formName, setFormName] = useState('')
  const [formRole, setFormRole] = useState<'officer' | 'admin'>('officer')
  const [formDeptId, setFormDeptId] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false)
  const [editingOfficer, setEditingOfficer] = useState<Officer | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<'officer' | 'admin'>('officer')
  const [editDeptId, setEditDeptId] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete confirmation state
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingOfficer, setDeletingOfficer] = useState<Officer | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const fetchOfficers = useCallback(async () => {
    try {
      const res = await fetch('/api/officers')
      if (!res.ok) throw new Error('Failed to fetch officers')
      const json = await res.json()
      setOfficers(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOfficers()
    // Fetch departments for dropdown
    async function fetchDepts() {
      const res = await fetch('/api/departments')
      if (res.ok) {
        const json = await res.json()
        setDepartments(json.data)
      }
    }
    fetchDepts()
  }, [fetchOfficers])

  function openAdd() {
    setFormEmail('')
    setFormPassword('')
    setFormName('')
    setFormRole('officer')
    setFormDeptId('')
    setFormError('')
    setAddOpen(true)
  }

  async function handleAdd() {
    if (!formEmail.trim() || !formPassword || !formName.trim()) {
      setFormError('Email, password, and name are required')
      return
    }
    if (formPassword.length < 8) {
      setFormError('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const body: Record<string, unknown> = {
        email: formEmail.trim(),
        password: formPassword,
        full_name: formName.trim(),
        role: formRole,
      }
      if (formRole === 'officer' && formDeptId) {
        body.department_id = formDeptId
      }

      const res = await fetch('/api/officers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to create officer')
      }
      setAddOpen(false)
      await fetchOfficers()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(officer: Officer) {
    setEditingOfficer(officer)
    setEditName(officer.full_name)
    setEditRole(officer.role)
    setEditDeptId(officer.department_id || '')
    setEditError('')
    setEditOpen(true)
  }

  async function handleEdit() {
    if (!editingOfficer || !editName.trim()) {
      setEditError('Name is required')
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      const body: Record<string, unknown> = {
        full_name: editName.trim(),
        role: editRole,
      }
      if (editRole === 'officer' && editDeptId) {
        body.department_id = editDeptId
      } else {
        body.department_id = null
      }

      const res = await fetch(`/api/officers/${editingOfficer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to update officer')
      }
      setEditOpen(false)
      setEditingOfficer(null)
      await fetchOfficers()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error')
    } finally {
      setEditSaving(false)
    }
  }

  function openDelete(officer: Officer) {
    setDeletingOfficer(officer)
    setDeleteError('')
    setDeleteOpen(true)
  }

  async function handleDelete() {
    if (!deletingOfficer) return
    setDeleteSaving(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/officers/${deletingOfficer.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to delete officer')
      }
      setDeleteOpen(false)
      setDeletingOfficer(null)
      await fetchOfficers()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Error')
    } finally {
      setDeleteSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Officers" description="Manage system officers and access">
        <Button size="sm" onClick={openAdd}>
          <Plus size={14} />
          Add Officer
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
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {officers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No officers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  officers.map((officer) => (
                    <TableRow key={officer.id}>
                      <TableCell className="font-medium">{officer.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {/* Email not in Officer type, show id truncated */}
                        {officer.id.slice(0, 8)}…
                      </TableCell>
                      <TableCell>
                        <Badge variant={officer.role === 'admin' ? 'default' : 'secondary'}>
                          {officer.role}
                        </Badge>
                      </TableCell>
                      <TableCell>{officer.department?.name || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(officer.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon-xs" onClick={() => openEdit(officer)}>
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-destructive hover:text-destructive"
                            onClick={() => openDelete(officer)}
                          >
                            <Trash2 size={14} />
                          </Button>
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

      {/* Add Officer Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Officer</DialogTitle>
            <DialogDescription>Create a new officer account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Full Name</label>
              <Input
                placeholder="e.g. Ahmed Khan"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input
                type="email"
                placeholder="officer@example.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Password (min 8 chars)</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <Select value={formRole} onValueChange={(v: string | null) => setFormRole((v ?? 'officer') as 'officer' | 'admin')}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="officer">Officer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formRole === 'officer' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Department</label>
                <Select value={formDeptId} onValueChange={(v: string | null) => setFormDeptId(v ?? '')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {formError && (
              <p className="text-xs text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? 'Creating...' : 'Create Officer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Officer Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Officer</DialogTitle>
            <DialogDescription>Update officer details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Full Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <Select value={editRole} onValueChange={(v: string | null) => setEditRole((v ?? 'officer') as 'officer' | 'admin')}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="officer">Officer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editRole === 'officer' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Department</label>
                <Select value={editDeptId} onValueChange={(v: string | null) => setEditDeptId(v ?? '')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {editError && (
              <p className="text-xs text-destructive">{editError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={editSaving}>
              {editSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Officer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deletingOfficer?.full_name}</strong>? This action cannot be undone.
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
