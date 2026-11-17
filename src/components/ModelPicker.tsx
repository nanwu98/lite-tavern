import type { ProviderModel } from '../lib/providers';
import { Dropdown } from './Dropdown';
import { IconSparkles } from './Icons';

interface ModelPickerProps {
  id?: string;
  value: string;
  models: ProviderModel[];
  placeholder?: string;
  disabled?: boolean;
  /** Free-form ids are always accepted: presets and /models are hints, not a whitelist. */
  onChange: (model: string) => void;
}

/**
 * Model chooser.
 *
 * A thin projection of `Dropdown`: the model id is the primary text and the
 * preset description ("V4.1 Flash · 通用，支持图像") is the muted hint. Typing a
 * model id that is not listed is always allowed — the provider console is the
 * source of truth, and `/models` is only a convenience.
 */
export function ModelPicker({
  id,
  value,
  models,
  placeholder = '选择或输入模型名',
  disabled,
  onChange,
}: ModelPickerProps) {
  return (
    <Dropdown
      id={id}
      value={value}
      options={models.map((model) => ({
        value: model.id,
        label: model.id,
        hint: model.label && model.label !== model.id ? model.label : undefined,
      }))}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      searchable
      allowCustom
      customHint="使用自定义模型名"
      ariaLabel="模型列表"
      emptyText="没有匹配的模型。换个关键词，或直接输入模型名后回车。"
      footer={
        <>
          <IconSparkles width={11} height={11} /> 可手动输入任意模型名，以服务商控制台为准
        </>
      }
    />
  );
}
