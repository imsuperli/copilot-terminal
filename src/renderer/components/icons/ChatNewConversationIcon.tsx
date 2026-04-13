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
      <path
        d="M4.75 8.5A2.75 2.75 0 0 1 7.5 5.75h5.25A2.75 2.75 0 0 1 15.5 8.5v4.25a2.75 2.75 0 0 1-2.75 2.75H9.25L6.5 17.75V15.5h1A2.75 2.75 0 0 1 4.75 12.75V8.5Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M7.9 9.45h4.45"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />

      <path
        d="M7.9 12.2h2.9"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        opacity="0.8"
      />

      <path
        d="M18.4 5.45v4.1M16.35 7.5h4.1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
};

ChatNewConversationIcon.displayName = 'ChatNewConversationIcon';
