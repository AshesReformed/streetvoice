'use client'

import { useEffect, useState, useCallback } from 'react'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import type { Department } from '@/lib/types'

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog state
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formKeywords, setFormKeywords] = useState('')
  const [formContact, setFormContact] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Delete confirmation state
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingDept, setDeletingDept] = useState<Department | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/departments')
      if (!res.ok) throw new Error('Failed to fetch departments')
      const json = await res.json()
      setDepartments(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDepartments()
  }, [fetchDepartments])

  function openAdd() {
    setFormName('')
    setFormKeywords('')
    setFormContact('')
    setFormError('')
    setAddOpen(true)
  }

  function openEdit(dept: Department) {
    setEditingDept(dept)
    setFormName(dept.name)
    setFormKeywords(dept.keywords.join(', '))
    setFormContact(dept.contact_info || '')
    setFormError('')
    setEditOpen(true)
  }

  function parseKeywords(input: string): string[] {
    return input
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
  }

  async function handleAdd() {
    if (!formName.trim()) {
      setFormError('Name is required')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          keywords: parseKeywords(formKeywords),
          contact_info: formContact.trim() || null,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to create')
      }
      setAddOpen(false)
      await fetchDepartments()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit() {
    if (!editingDept || !formName.trim()) {
      setFormError('Name is required')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const res = await fetch(`/api/departments/${editingDept.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          keywords: parseKeywords(formKeywords),
          contact_info: formContact.trim() || null,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to update')
      }
      setEditOpen(false)
      setEditingDept(null)
      await fetchDepartments()
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
      await fetchDepartments()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Error')
    } finally {
      setDeleteSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Departments" description="Manage complaint departments and keywords">
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
                  <TableHead>Keywords</TableHead>
                  <TableHead>Contact Info</TableHead>
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
                      <TableCell className="font-medium">{dept.name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {dept.keywords.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            dept.keywords.map((kw, i) => (
                              <Badge key={i} variant="secondary">{kw}</Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{dept.contact_info || '—'}</TableCell>
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

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Department</DialogTitle>
            <DialogDescription>Create a new department for complaint routing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                placeholder="e.g. Water & Sanitation"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Keywords (comma-separated)</label>
              <Input
                placeholder="e.g. water, sewage, drainage"
                value={formKeywords}
                onChange={(e) => setFormKeywords(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Contact Info</label>
              <Input
                placeholder="Phone or email"
                value={formContact}
                onChange={(e) => setFormContact(e.target.value)}
              />
            </div>
            {formError && (
              <p className="text-xs text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Department</DialogTitle>
            <DialogDescription>Update department details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Keywords (comma-separated)</label>
              <Input
                value={formKeywords}
                onChange={(e) => setFormKeywords(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Contact Info</label>
              <Input
                value={formContact}
                onChange={(e) => setFormContact(e.target.value)}
              />
            </div>
            {formError && (
              <p className="text-xs text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
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
