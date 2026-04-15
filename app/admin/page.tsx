"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trash2, GripVertical, Upload, LogOut, Plus } from "lucide-react"

interface Release {
  id: string
  artist: string
  album: string
  image_url: string
  link: string | null
  display_order: number
}

export default function AdminPage() {
  const [user, setUser] = useState<{ email: string } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [releases, setReleases] = useState<Release[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // New release form
  const [newRelease, setNewRelease] = useState({
    artist: "",
    album: "",
    image_url: "",
    link: "",
  })
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()

  const checkAuth = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push("/auth/login?redirect=/admin")
      return
    }

    setUser({ email: user.email || "" })

    // Check if user is admin
    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (adminUser) {
      setIsAdmin(true)
      fetchReleases()
    }
    
    setLoading(false)
  }, [supabase, router])

  const fetchReleases = async () => {
    const res = await fetch("/api/releases")
    const data = await res.json()
    if (data.releases) {
      setReleases(data.releases)
    }
  }

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    
    // Show preview immediately
    const reader = new FileReader()
    reader.onload = (e) => setPreviewImage(e.target?.result as string)
    reader.readAsDataURL(file)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()
      
      if (data.url) {
        setNewRelease(prev => ({ ...prev, image_url: data.url }))
      } else {
        alert("Upload failed: " + (data.error || "Unknown error"))
      }
    } catch (error) {
      console.error("Upload error:", error)
      alert("Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const handleAddRelease = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newRelease.artist || !newRelease.album || !newRelease.image_url) {
      alert("Please fill in artist, album, and upload an image")
      return
    }

    setSaving(true)

    try {
      const res = await fetch("/api/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRelease),
      })

      const data = await res.json()
      
      if (data.release) {
        setReleases(prev => [...prev, data.release])
        setNewRelease({ artist: "", album: "", image_url: "", link: "" })
        setPreviewImage(null)
      } else {
        alert("Failed to add release: " + (data.error || "Unknown error"))
      }
    } catch (error) {
      console.error("Error:", error)
      alert("Failed to add release")
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRelease = async (id: string) => {
    if (!confirm("Are you sure you want to delete this release?")) return

    try {
      const res = await fetch(`/api/releases?id=${id}`, {
        method: "DELETE",
      })

      if (res.ok) {
        setReleases(prev => prev.filter(r => r.id !== id))
      } else {
        alert("Failed to delete release")
      }
    } catch (error) {
      console.error("Error:", error)
      alert("Failed to delete release")
    }
  }

  const handleReorder = async (dragIndex: number, dropIndex: number) => {
    const newReleases = [...releases]
    const [removed] = newReleases.splice(dragIndex, 1)
    newReleases.splice(dropIndex, 0, removed)
    
    setReleases(newReleases)

    // Save new order to database
    try {
      await fetch("/api/releases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releases: newReleases }),
      })
    } catch (error) {
      console.error("Error saving order:", error)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              You don&apos;t have admin access. Contact the site owner to be added as an admin.
            </p>
            <p className="text-sm text-muted-foreground">
              Logged in as: {user?.email}
            </p>
            <Button onClick={handleSignOut} variant="outline" className="w-full">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Button onClick={handleSignOut} variant="outline" size="sm">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Add New Release */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add New Release
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddRelease} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Artist *</label>
                    <Input
                      value={newRelease.artist}
                      onChange={(e) => setNewRelease(prev => ({ ...prev, artist: e.target.value }))}
                      placeholder="Artist name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Album *</label>
                    <Input
                      value={newRelease.album}
                      onChange={(e) => setNewRelease(prev => ({ ...prev, album: e.target.value }))}
                      placeholder="Album title"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Link (optional)</label>
                    <Input
                      value={newRelease.link}
                      onChange={(e) => setNewRelease(prev => ({ ...prev, link: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Album Artwork *</label>
                  <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                    {previewImage || newRelease.image_url ? (
                      <div className="relative aspect-square w-48 mx-auto">
                        <Image
                          src={previewImage || newRelease.image_url}
                          alt="Preview"
                          fill
                          className="object-cover rounded"
                        />
                      </div>
                    ) : (
                      <div className="py-8">
                        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Upload square image</p>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      id="image-upload"
                      disabled={uploading}
                    />
                    <label htmlFor="image-upload">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        disabled={uploading}
                        asChild
                      >
                        <span>{uploading ? "Uploading..." : "Choose Image"}</span>
                      </Button>
                    </label>
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={saving || !newRelease.image_url}>
                {saving ? "Adding..." : "Add Release"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Current Releases */}
        <Card>
          <CardHeader>
            <CardTitle>Current Releases ({releases.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {releases.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No releases yet. Add your first one above!
              </p>
            ) : (
              <div className="space-y-2">
                {releases.map((release, index) => (
                  <div
                    key={release.id}
                    className="flex items-center gap-4 p-3 bg-secondary/50 rounded-lg"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("index", index.toString())}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const dragIndex = parseInt(e.dataTransfer.getData("index"))
                      handleReorder(dragIndex, index)
                    }}
                  >
                    <GripVertical className="w-5 h-5 text-muted-foreground cursor-grab" />
                    <div className="relative w-16 h-16 flex-shrink-0">
                      <Image
                        src={release.image_url}
                        alt={`${release.artist} - ${release.album}`}
                        fill
                        className="object-cover rounded"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{release.artist}</p>
                      <p className="text-sm text-muted-foreground truncate">{release.album}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteRelease(release.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
