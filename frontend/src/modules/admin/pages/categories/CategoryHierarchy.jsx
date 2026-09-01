import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid,
  List,
  ChevronRight,
  Search,
  FolderOpen,
  Folder,
  Tag,
  Layers,
  ArrowRight,
  Package,
  RotateCw
} from "lucide-react";
import { adminApi } from "../../services/adminApi";
import Card from "@shared/components/ui/Card";
import PageHeader from "@shared/components/ui/PageHeader";
import Badge from "@shared/components/ui/Badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CategoryHierarchy = () => {
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedHeader, setSelectedHeader] = useState(null);
  const [selectedLevel2, setSelectedLevel2] = useState(null);

  const stats = useMemo(() => {
    let headers = 0;
    let l2 = 0;
    let subs = 0;

    const traverse = (items) => {
      items.forEach((item) => {
        if (item.type === "header") headers++;
        if (item.type === "category") l2++;
        if (item.type === "subcategory") subs++;
        if (item.children) traverse(item.children);
      });
    };
    traverse(categories);
    return { headers, l2, subs, total: headers + l2 + subs };
  }, [categories]);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.getCategoryTree();
      if (res.data.success) {
        setCategories(res.data.results || res.data.result || []);
      }
    } catch (error) {
      toast.error("Failed to fetch category hierarchy");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredHeaders = useMemo(() => {
    if (!searchTerm) return categories.filter((c) => c.type === "header");
    return categories.filter(
      (c) =>
        c.type === "header" &&
        c.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [categories, searchTerm]);

  const activeLevel2 = useMemo(() => {
    if (!selectedHeader) return [];
    return selectedHeader.children || [];
  }, [selectedHeader]);

  const activeSubs = useMemo(() => {
    if (!selectedLevel2) return [];
    return selectedLevel2.children || [];
  }, [selectedLevel2]);

  const handleHeaderSelect = (header) => {
    setSelectedHeader(header);
    setSelectedLevel2(null);
  };

  const handleLevel2Select = (l2) => {
    setSelectedLevel2(l2);
  };

  const ColumnHeader = ({ title, icon: Icon, count, accentColor = "bg-primary" }) => (
    <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 sticky top-0 z-10 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className={cn("h-2 w-2 rounded-full", accentColor)} />
        <Icon className="w-4 h-4 text-slate-500" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">{title}</span>
      </div>
      <Badge variant="gray" className="font-mono">
        {count}
      </Badge>
    </div>
  );

  const ListItem = ({ item, isSelected, onClick, hasChildren, type }) => {
    const activeClass = isSelected
      ? "bg-primary/10 border-primary/30 text-primary dark:bg-primary/20 shadow-sm"
      : "hover:bg-slate-50 dark:hover:bg-slate-800/50 border-transparent text-slate-700 dark:text-slate-300";

    const iconColor = isSelected ? "text-primary" : "text-slate-400";

    return (
      <div
        onClick={onClick}
        className={cn(
          "group flex items-center justify-between p-2.5 mx-2 my-1 rounded-xl border cursor-pointer transition-all duration-150",
          activeClass
        )}
      >
        <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden border border-slate-200/60 dark:border-slate-700",
              isSelected ? "bg-white dark:bg-slate-900" : "bg-slate-100 dark:bg-slate-800"
            )}
          >
            {item.image?.url || item.image ? (
              <img
                src={item.image?.url || item.image}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : type === "header" ? (
              <FolderOpen className={cn("w-4 h-4", iconColor)} />
            ) : type === "category" ? (
              <Folder className={cn("w-4 h-4", iconColor)} />
            ) : (
              <Tag className={cn("w-4 h-4", iconColor)} />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">{item.name}</span>
            <span className="text-[10px] uppercase font-mono text-slate-400 truncate">
              {item.slug}
            </span>
          </div>
        </div>

        {hasChildren && (
          <ChevronRight
            className={cn("w-4 h-4 shrink-0", isSelected ? "text-primary" : "text-slate-300 dark:text-slate-600")}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Category Hierarchy Explorer"
        description="Miller columns visual overview of your store's multi-tier catalog structure."
        icon={Layers}
        badge={
          <Badge variant="primary" className="font-mono">
            {stats.total} Total Nodes
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
              <span>Headers: <b className="text-slate-900 dark:text-white font-mono">{stats.headers}</b></span>
              <span>•</span>
              <span>Level 2: <b className="text-slate-900 dark:text-white font-mono">{stats.l2}</b></span>
              <span>•</span>
              <span>Subcategories: <b className="text-slate-900 dark:text-white font-mono">{stats.subs}</b></span>
            </div>
            <button
              onClick={fetchCategories}
              className="ds-btn ds-btn-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 shadow-sm"
            >
              <RotateCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin text-primary")} />
              <span>Refresh</span>
            </button>
          </div>
        }
      />

      {/* Miller Columns Container */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-250px)] min-h-[500px]">
        {/* Column 1: Headers */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden">
          <ColumnHeader
            title="Header Categories"
            icon={LayoutGrid}
            count={filteredHeaders.length}
            accentColor="bg-primary"
          />

          <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search header categories..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ds-input w-full pl-8 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Loading category structure...
              </div>
            ) : filteredHeaders.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No headers match search
              </div>
            ) : (
              filteredHeaders.map((header) => (
                <ListItem
                  key={header._id || header.id}
                  item={header}
                  type="header"
                  isSelected={
                    selectedHeader &&
                    (selectedHeader._id || selectedHeader.id) === (header._id || header.id)
                  }
                  onClick={() => handleHeaderSelect(header)}
                  hasChildren={header.children && header.children.length > 0}
                />
              ))
            )}
          </div>
        </div>

        {/* Column 2: Level 2 */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden">
          <ColumnHeader
            title="Main Categories (L2)"
            icon={Folder}
            count={activeLevel2.length}
            accentColor="bg-purple-500"
          />

          {!selectedHeader ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <ArrowRight className="w-8 h-8 mb-2 opacity-30 text-slate-400" />
              <p className="text-xs font-medium">Select a Header Category to expand its Level 2 contents</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
              {activeLevel2.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No Level 2 categories in <br />
                  <span className="font-bold text-slate-600 dark:text-slate-300">"{selectedHeader.name}"</span>
                </div>
              ) : (
                activeLevel2.map((l2) => (
                  <ListItem
                    key={l2._id || l2.id}
                    item={l2}
                    type="category"
                    isSelected={
                      selectedLevel2 &&
                      (selectedLevel2._id || selectedLevel2.id) === (l2._id || l2.id)
                    }
                    onClick={() => handleLevel2Select(l2)}
                    hasChildren={l2.children && l2.children.length > 0}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Column 3: Subcategories */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden">
          <ColumnHeader
            title="Subcategories (L3)"
            icon={Tag}
            count={activeSubs.length}
            accentColor="bg-blue-500"
          />

          {!selectedLevel2 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <ArrowRight className="w-8 h-8 mb-2 opacity-30 text-slate-400" />
              <p className="text-xs font-medium">Select a Main Category to view subcategories</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
              {activeSubs.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No subcategories in <br />
                  <span className="font-bold text-slate-600 dark:text-slate-300">"{selectedLevel2.name}"</span>
                </div>
              ) : (
                activeSubs.map((sub) => (
                  <ListItem
                    key={sub._id || sub.id}
                    item={sub}
                    type="subcategory"
                    isSelected={false}
                    onClick={() => {}}
                    hasChildren={false}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoryHierarchy;
