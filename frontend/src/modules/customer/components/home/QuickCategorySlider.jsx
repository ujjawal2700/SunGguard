import React from "react";
import { QUICK_CATEGORY_PALETTES } from "../../constants/homeConstants";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";
import QuickCategoriesBg from "@/assets/Catagorysection_bg.png";

const QuickCategorySlider = ({ categories, onCategoryClick }) => {
  if (!categories || categories.length === 0) return null;

  const count = categories.length;

  return (
    <div className="w-full mb-5 -mt-[24px] md:mt-3 overflow-hidden relative z-20">
      <div
        className="relative overflow-hidden bg-white shadow-[0_14px_28px_rgba(15,23,42,0.09)]"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.65) 100%), url(${QuickCategoriesBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}>
        <div className="absolute inset-0 bg-white/10 pointer-events-none" />

        <div className="relative z-10 px-4 pt-2.5 pb-0.5 md:px-8 md:pt-4">
          <h2 className="text-center text-[17px] md:text-[20px] font-bold tracking-tight text-[#132018] leading-none">
            Quick categories
          </h2>
        </div>

        <div
          className="relative z-10 grid w-full gap-2 md:gap-3 px-4 pb-3 pt-1 md:px-8 md:pb-4"
          style={{
            gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
          }}>
          {categories.map((cat, idx) => {
            const palette = QUICK_CATEGORY_PALETTES[idx % QUICK_CATEGORY_PALETTES.length];
            return (
              <div
                key={cat.id}
                onClick={() => onCategoryClick(cat.id)}
                className="flex min-w-0 flex-col items-center gap-0.5 cursor-pointer group/item transition-transform active:scale-95">
                <div
                  className="relative w-full max-w-[120px] mx-auto aspect-[74/84] rounded-[18px] md:rounded-[22px] shadow-[0_8px_18px_rgba(15,23,42,0.10)] border flex items-start justify-center p-1.5 md:p-2 transition-all duration-300 group-hover/item:-translate-y-1 group-hover/item:shadow-[0_16px_30px_rgba(15,23,42,0.14)] overflow-hidden smooth-transform"
                  style={{
                    backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.6) 24%, rgba(255,255,255,0.15) 100%), linear-gradient(135deg, ${palette.bgFrom}, ${palette.bgVia}, ${palette.bgTo})`,
                    borderColor: palette.frameColor,
                  }}>
                  <div
                    className="absolute inset-0 opacity-40 pointer-events-none"
                    style={{ backgroundColor: palette.glowColor }}
                  />
                  <img
                    src={applyCloudinaryTransform(cat.image, "f_auto,q_auto,w_150")}
                    alt={cat.name}
                    loading="lazy"
                    className="absolute left-1/2 top-[12%] z-10 h-[55%] w-auto max-w-[70%] -translate-x-1/2 object-contain drop-shadow-[0_5px_12px_rgba(15,23,42,0.10)] mix-blend-multiply group-hover/item:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-x-1 md:inset-x-2 bottom-1.5 z-20 text-center">
                    <span className="block text-[9px] md:text-[10px] lg:text-[11px] font-semibold text-[#1f2b20] leading-tight whitespace-nowrap overflow-hidden text-ellipsis drop-shadow-[0_1px_0_rgba(255,255,255,0.65)] group-hover/item:text-primary transition-colors">
                      {cat.name}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default React.memo(QuickCategorySlider);
