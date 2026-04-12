import React from 'react';

interface ChatNewConversationIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const ChatNewConversationIcon: React.FC<ChatNewConversationIconProps> = ({
  size = 16,
  className = '',
  ...rest
}) => {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...rest}
    >
      <circle
        cx="7.1"
        cy="7.2"
        r="2.25"
        stroke="currentColor"
        strokeWidth="1.45"
        opacity="0.92"
      />

      <path
        d="M9.35 5.1A8.05 8.05 0 1 1 18.2 18.1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      <path
        d="M17.05 19.05a8.1 8.1 0 0 1-2.55.45"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.8"
      />

      <path
        d="M12 9.15v5.7M9.15 12h5.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
};

ChatNewConversationIcon.displayName = 'ChatNewConversationIcon';
