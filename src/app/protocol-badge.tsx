export function ProtocolBadge({
                                  name,
                                  endpoint,
                              }: {
    name: string;
    endpoint: string;
}) {
    return (
        <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-50 dark:bg-[#1e2130] text-[11px] font-medium text-gray-500 dark:text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"/>
            {name}
            <span className="text-gray-400 dark:text-gray-500 font-mono text-[10px]">
        {endpoint}
      </span>
        </div>
    );
}