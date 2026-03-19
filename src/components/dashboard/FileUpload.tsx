type FileUploadProps = {
  id: string;
  label: string;
  accept?: string;
  error?: string;
  fileName?: string;
  disabled?: boolean;
  onChange: (file: File | null) => void;
};

export default function FileUpload({
  id,
  label,
  accept,
  error,
  fileName,
  disabled,
  onChange,
}: FileUploadProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white text-sm text-slate-700 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-blue-700 hover:file:bg-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
      {fileName ? <p className="text-xs text-slate-500">Selected: {fileName}</p> : null}
      {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
