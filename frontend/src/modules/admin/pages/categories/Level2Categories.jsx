import React, { useState, useEffect, useMemo, useRef } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Pagination from "@shared/components/ui/Pagination";
import {
  Plus,
  Search,
  Edit,
  Trash,
  Trash2,
  X,
  Upload,
  Image,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { adminApi } from "../../services/adminApi";
import { toast } from "sonner";

import PageHeader from "@shared/components/ui/PageHeader";

const makeSlug = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/-+/g, "-");

const Level2Categories = () => {
  const [categories, setCategories] = useState([]);
  const [headerCategories, setHeaderCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterHeader, setFilterHeader] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    status: "active",
    type: "category",
    parentId: "",
  });

  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.getCategories();
      if (res.data.success) {
        const payload = res.data.result;
        const results = res.data.results;
        const allCats = Array.isArray(results)
          ? results
          : Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.items)
              ? payload.items
              : [];
        setCategories(allCats.filter((c) => c.type === "category"));
        setHeaderCategories(allCats.filter((c) => c.type === "header"));
      }
    } catch (error) {
      toast.error("Failed to fetch categories");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCategories = useMemo(() => {
    const filtered = categories.filter((cat) => {
      const matchesSearch = cat.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesHeader =
        filterHeader === "all" ||
        (cat.parentId && cat.parentId._id === filterHeader) ||
        cat.parentId === filterHeader;
      return matchesSearch && matchesHeader;
    });

    return [...filtered].sort((a, b) => {
      const aName = String(a.name || "").toLowerCase();
      const bName = String(b.name || "").toLowerCase();
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();

      switch (sortBy) {
        case "oldest":
          return aTime - bTime;
        case "name-asc":
          return aName.localeCompare(bName);
        case "name-desc":
          return bName.localeCompare(aName);
        case "newest":
        default:
          return bTime - aTime;
      }
    });
  }, [categories, searchTerm, filterHeader, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / pageSize));

  const paginatedCategories = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredCategories.slice(startIndex, startIndex + pageSize);
  }, [filteredCategories, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterHeader, sortBy, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.slug || !formData.parentId) {
      toast.error("Name, slug and parent header are required");
      return;
    }

    setIsSaving(true);
    try {
      const data = new FormData();
      data.append("type", "category");

      // Only append fields that have actual values to avoid sending empty objects/junk
      Object.keys(formData).forEach((key) => {
        const val = formData[key];
        if (key !== "type" && val !== undefined && val !== null && val !== "") {
          data.append(key, val);
        }
      });

      if (imageFile) {
        data.append("image", imageFile);
      } else if (previewUrl && !previewUrl.startsWith("blob:")) {
        data.append("image", previewUrl);
      }

      if (editingItem) {
        await adminApi.updateCategory(editingItem._id || editingItem.id, data);
        toast.success("Category updated");
      } else {
        await adminApi.createCategory(data);
        toast.success("Category created");
      }
      setIsAddModalOpen(false);
      setEditingItem(null);
      fetchCategories();
    } catch (error) {
      console.error(error);
      const errorMsg = error.response?.data?.message || (editingItem ? "Failed to update" : "Failed to create");
      toast.error(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await adminApi.deleteCategory(deleteTarget._id || deleteTarget.id);
      toast.success("Category deleted");
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      fetchCategories();
    } catch (error) {
      toast.error("Failed to delete category");
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({
      name: "",
      slug: "",
      description: "",
      status: "active",
      type: "category",
      parentId: "",
    });
    setImageFile(null);
    setPreviewUrl(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      slug: item.slug,
      description: item.description || "",
      status: item.status,
      type: "category",
      parentId: item.parentId?._id || item.parentId || "",
    });
    setPreviewUrl(item.image || null);
    setIsAddModalOpen(true);
  };

  // Helper to find parent name
  const getParentName = (parentId) => {
    const id = parentId?._id || parentId;
    const parent = headerCategories.find((h) => (h._id || h.id) === id);
    return parent ? parent.name : "Unknown";
  };

  const handleSelect = (id) => {
    setSelectedItems((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedItems(paginatedCategories.map((c) => c._id || c.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) return;

    if (
      window.confirm(
        `Are you sure you want to delete ${selectedItems.length} items?`,
      )
    ) {
      try {
        await Promise.all(
          selectedItems.map((id) => adminApi.deleteCategory(id)),
        );
        toast.success("Categories deleted");
        setSelectedItems([]);
        fetchCategories();
      } catch (error) {
        console.error("Bulk delete error:", error);
        toast.error("Failed to delete some categories");
      }
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Main Categories (Level 2)"
        description="Manage secondary product categories grouped under headers."
        badge={
          <Badge variant="primary" className="font-mono">
            {categories.length} Categories
          </Badge>
        }
        actions={
          <button
            onClick={openAddModal}
            className="ds-btn ds-btn-md bg-primary text-white hover:bg-primary/90 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Level 2 Category</span>
          </button>
        }
      />

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex gap-3 items-center flex-wrap bg-slate-50/50 dark:bg-slate-800/20">
          {selectedItems.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-3.5 py-2 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors text-xs font-semibold"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete ({selectedItems.length})</span>
            </button>
          )}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ds-input w-full pl-9"
            />
          </div>
          <div className="flex items-center gap-2 min-w-[200px]">
            <select
              value={filterHeader}
              onChange={(e) => setFilterHeader(e.target.value)}
              className="ds-select w-full"
            >
              <option value="all">All Header Categories</option>
              {headerCategories.map((h) => (
                <option key={h._id || h.id} value={h._id || h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 min-w-[180px]">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="py-3 px-4 text-left">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    checked={
                      selectedItems.length > 0 &&
                      paginatedCategories.length > 0 &&
                      paginatedCategories.every((cat) =>
                        selectedItems.includes(cat._id || cat.id),
                      )
                    }
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Image
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Parent Header
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Slug
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-gray-500">
                    No categories found
                  </td>
                </tr>
              ) : (
                paginatedCategories.map((cat) => (
                  <tr
                    key={cat._id || cat.id}
                    className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4.5 px-6">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 h-4 w-4"
                        checked={selectedItems.includes(cat._id || cat.id)}
                        onChange={() => handleSelect(cat._id || cat.id)}
                      />
                    </td>
                    <td className="py-4.5 px-6">
                      <div className="w-11 h-11 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200 shrink-0">
                        {cat.image ? (
                          <img
                            src={typeof cat.image === 'string' ? cat.image : (cat.image.url || cat.image.secure_url || cat.image)}
                            alt={cat.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Image className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </td>
                    <td className="py-4.5 px-6 font-bold text-base text-slate-900 dark:text-white">
                      {cat.name}
                    </td>
                    <td className="py-4.5 px-6 text-slate-500">
                      <Badge
                        variant="neutral"
                        className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold px-2.5 py-1">
                        {getParentName(cat.parentId)}
                      </Badge>
                    </td>
                    <td className="py-4.5 px-6 text-sm font-mono text-slate-500">{cat.slug}</td>
                    <td className="py-4.5 px-6">
                      <Badge
                        variant={
                          cat.status === "active" ? "success" : "warning"
                        }>
                        {cat.status}
                      </Badge>
                    </td>
                    <td className="py-4.5 px-6 text-right space-x-2">
                      <button
                        onClick={() => openEditModal(cat)}
                        className="p-1 text-gray-500 hover:text-brand-600 transition-colors">
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => {
                          setDeleteTarget(cat);
                          setIsDeleteModalOpen(true);
                        }}
                        className="p-1 text-gray-500 hover:text-red-600 transition-colors">
                        <Trash className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={filteredCategories.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            loading={isLoading}
          />
        </div>
      </Card>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900">
                  {editingItem ? "Edit Category" : "Add Category"}
                </h2>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Image Upload */}
                <div className="flex justify-center">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-full bg-gray-50 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-brand-500 overflow-hidden transition-colors">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center">
                        <Image className="w-8 h-8 text-gray-400 mx-auto" />
                        <span className="text-xs text-gray-500 mt-1">
                          Upload
                        </span>
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleImageChange}
                    accept="image/*"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Parent Header Category
                  </label>
                  <select
                    value={formData.parentId}
                    onChange={(e) =>
                      setFormData({ ...formData, parentId: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                    <option value="">Select Header Category</option>
                    {headerCategories.map((h) => (
                      <option key={h._id || h.id} value={h._id || h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        name: e.target.value,
                        slug: makeSlug(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    placeholder="e.g., Laptops"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Slug
                  </label>
                  <input
                    type="text"
                    value={formData.slug}
                    readOnly
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-gray-50 text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    placeholder="e.g., laptops"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 bg-black  text-primary-foreground rounded-lg hover:bg-brand-700 font-medium disabled:opacity-50 flex items-center gap-2">
                  {isSaving && (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {editingItem ? "Update Category" : "Create Category"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
              <div className="p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
                  <Trash className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Delete Category?
                </h3>
                <p className="text-gray-500 text-sm mb-6">
                  Are you sure you want to delete{" "}
                  <span className="font-semibold text-gray-900">
                    {deleteTarget?.name}
                  </span>
                  ? This action cannot be undone.
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Level2Categories;
