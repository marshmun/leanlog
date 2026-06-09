'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { Upload, X, Camera } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { ProgressPhoto, PhotoType } from '@/lib/types'

const PHOTO_TYPES: { value: PhotoType; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'side',  label: 'Side'  },
  { value: 'back',  label: 'Back'  },
]

function getPublicUrl(path: string) {
  const { data } = supabase.storage.from('progress-photos').getPublicUrl(path)
  return data.publicUrl
}

export default function Photos() {
  const [photos,     setPhotos]     = useState<ProgressPhoto[]>([])
  const [loading,    setLoading]    = useState(true)
  const [uploading,  setUploading]  = useState(false)
  const [dragOver,   setDragOver]   = useState(false)
  const [uploadDate, setUploadDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [uploadType, setUploadType] = useState<PhotoType>('front')
  const [uploadNote, setUploadNote] = useState('')
  const [compareA,   setCompareA]   = useState('')
  const [compareB,   setCompareB]   = useState('')
  const [deleteId,   setDeleteId]   = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadPhotos = useCallback(async () => {
    const { data } = await supabase
      .from('progress_photos')
      .select()
      .order('date', { ascending: false })
    setPhotos((data as ProgressPhoto[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadPhotos() }, [loadPhotos])

  async function handleUpload(file: File) {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${uploadDate}/${uploadType}_${Date.now()}.${ext}`

    const { error: storageErr } = await supabase.storage
      .from('progress-photos')
      .upload(path, file, { contentType: file.type })

    if (storageErr) {
      alert(`Upload failed: ${storageErr.message}`)
      setUploading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const { error: dbErr } = await supabase.from('progress_photos').insert({
      date:         uploadDate,
      photo_type:   uploadType,
      storage_path: path,
      notes:        uploadNote || null,
      user_id:      user!.id,
    })

    if (dbErr) {
      alert(`Save failed: ${dbErr.message}`)
    } else {
      setUploadNote('')
      await loadPhotos()
    }
    setUploading(false)
  }

  async function confirmDelete(photo: ProgressPhoto) {
    setDeleteId(photo.id)
    await supabase.storage.from('progress-photos').remove([photo.storage_path])
    await supabase.from('progress_photos').delete().eq('id', photo.id)
    setPhotos(prev => prev.filter(p => p.id !== photo.id))
    setDeleteId(null)
  }

  // Group by date descending
  const byDate: Record<string, ProgressPhoto[]> = {}
  for (const p of photos) {
    if (!byDate[p.date]) byDate[p.date] = []
    byDate[p.date].push(p)
  }
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-neutral-800 rounded w-48" />
        <div className="h-44 bg-neutral-900 rounded-xl" />
        <div className="h-72 bg-neutral-900 rounded-xl" />
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto pb-12">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Progress Photos</h1>
        <p className="text-neutral-500 text-sm mt-0.5">{photos.length} photo{photos.length !== 1 ? 's' : ''} total</p>
      </div>

      {/* ── UPLOAD ─────────────────────────────────────────────────────────── */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">
        <p className="text-sm font-semibold text-white mb-4">Add Photo</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {/* Date */}
          <div>
            <label className="text-xs text-neutral-500 mb-1.5 block">Date</label>
            <input
              type="date"
              value={uploadDate}
              onChange={e => setUploadDate(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
            />
          </div>

          {/* Type */}
          <div>
            <label className="text-xs text-neutral-500 mb-1.5 block">View</label>
            <div className="flex gap-1">
              {PHOTO_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setUploadType(t.value)}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                    uploadType === t.value
                      ? 'bg-emerald-500 text-black'
                      : 'bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-xs text-neutral-500 mb-1.5 block">Note (optional)</label>
            <input
              type="text"
              value={uploadNote}
              onChange={e => setUploadNote(e.target.value)}
              placeholder="e.g. end of cut week 4"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Drop zone */}
        <div
          onClick={() => !uploading && fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true)  }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) handleUpload(file)
          }}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-2 transition-colors ${
            uploading ? 'border-neutral-700 cursor-not-allowed' :
            dragOver  ? 'border-emerald-500 bg-emerald-500/5 cursor-copy' :
                        'border-neutral-700 hover:border-emerald-500/50 cursor-pointer'
          }`}
        >
          {uploading ? (
            <>
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-neutral-400">Uploading…</p>
            </>
          ) : (
            <>
              <Upload size={24} className={dragOver ? 'text-emerald-400' : 'text-neutral-600'} />
              <p className="text-sm text-neutral-400">
                Drop image here or <span className="text-emerald-400">click to browse</span>
              </p>
              <p className="text-xs text-neutral-600">JPG · PNG · WEBP</p>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleUpload(f)
            e.target.value = ''
          }}
        />
      </div>

      {/* ── COMPARE ────────────────────────────────────────────────────────── */}
      {dates.length >= 2 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">
          <p className="text-sm font-semibold text-white mb-4">Compare</p>

          <div className="flex gap-3 mb-5">
            {(
              [
                { val: compareA, set: setCompareA, placeholder: 'Earlier date…' },
                { val: compareB, set: setCompareB, placeholder: 'Later date…'   },
              ] as const
            ).map(({ val, set, placeholder }) => (
              <select
                key={placeholder}
                value={val}
                onChange={e => set(e.target.value)}
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">{placeholder}</option>
                {dates.map(d => (
                  <option key={d} value={d}>{format(parseISO(d), 'MMM d, yyyy')}</option>
                ))}
              </select>
            ))}
          </div>

          {compareA && compareB && compareA !== compareB && (
            <div className="grid grid-cols-3 gap-3">
              {PHOTO_TYPES.map(t => {
                const pA = byDate[compareA]?.find(p => p.photo_type === t.value)
                const pB = byDate[compareB]?.find(p => p.photo_type === t.value)
                if (!pA && !pB) return null
                return (
                  <div key={t.value}>
                    <p className="text-xs text-neutral-500 text-center mb-1.5">{t.label}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {([{ photo: pA, date: compareA }, { photo: pB, date: compareB }] as const).map(({ photo, date }) => (
                        <div key={date}>
                          {photo ? (
                            <img
                              src={getPublicUrl(photo.storage_path)}
                              alt={`${t.label} ${date}`}
                              className="w-full aspect-[3/4] object-cover rounded-lg"
                            />
                          ) : (
                            <div className="w-full aspect-[3/4] bg-neutral-800 rounded-lg flex items-center justify-center">
                              <Camera size={14} className="text-neutral-700" />
                            </div>
                          )}
                          <p className="text-xs text-neutral-600 text-center mt-1">
                            {format(parseISO(date), 'MMM d')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PHOTO GRID ─────────────────────────────────────────────────────── */}
      {dates.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-10 text-center">
          <Camera size={36} className="text-neutral-700 mx-auto mb-3" />
          <p className="text-white font-semibold mb-1">No photos yet</p>
          <p className="text-neutral-500 text-sm">Upload your first progress photo above to start tracking visually.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {dates.map(date => (
            <div key={date}>
              <p className="text-sm font-semibold text-neutral-400 mb-2.5">
                {format(parseISO(date), 'EEEE, MMMM d, yyyy')}
              </p>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {PHOTO_TYPES.map(t => {
                  const photo = byDate[date].find(p => p.photo_type === t.value)
                  const isDeleting = photo && deleteId === photo.id

                  return (
                    <div key={t.value} className="relative group">
                      {photo ? (
                        <>
                          <img
                            src={getPublicUrl(photo.storage_path)}
                            alt={`${t.label} ${date}`}
                            className={`w-full aspect-[3/4] object-cover rounded-xl transition-opacity ${isDeleting ? 'opacity-40' : ''}`}
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 rounded-xl transition-colors pointer-events-none" />
                          <button
                            onClick={() => confirmDelete(photo)}
                            disabled={!!isDeleting}
                            className="absolute top-2 right-2 bg-black/70 hover:bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                          >
                            <X size={11} />
                          </button>
                          <p className="absolute bottom-2 left-2 text-xs text-white/80 font-medium drop-shadow">
                            {t.label}
                          </p>
                        </>
                      ) : (
                        <div className="w-full aspect-[3/4] bg-neutral-800 border border-neutral-700/50 rounded-xl flex flex-col items-center justify-center gap-1.5 opacity-35">
                          <Camera size={16} className="text-neutral-600" />
                          <p className="text-xs text-neutral-600">{t.label}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {byDate[date].find(p => p.notes)?.notes && (
                <p className="text-xs text-neutral-600 mt-1.5 italic">
                  {byDate[date].find(p => p.notes)!.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
