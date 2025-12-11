interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="w-12 h-12 flex items-center justify-center" aria-hidden="true">
        {icon}
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-2xl font-medium">{title}</h3>
        <p className="text-base text-black">{description}</p>
      </div>
    </div>
  );
}

export function ZeroFeesIcon() {
  return (
    <svg
      width="27"
      height="40"
      viewBox="0 0 27 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M23.9789 12.8567L23.9789 9.32574L17.1532 2.5L9.32574 2.5L2.50001 9.32574L2.5 12.8567L9.32574 19.6824L17.1532 19.6824L23.9789 26.5082L23.9789 30.142L17.1532 36.9677L9.32574 36.9677L2.5 30.142L2.5 27.1599"
        stroke="black"
        strokeWidth="5"
      />
      <line x1="9" y1="0" x2="55" y2="0" stroke="black" strokeWidth="5" />
    </svg>
  );
}

export function ZeroWaitIcon() {
  return (
    <svg
      width="46"
      height="46"
      viewBox="0 0 46 46"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M5.53711 0.0078125L40.0576 0.0107422L45.6504 5.60449L45.6533 45.5625H40.1133L40.1113 45.5537H5.59375L0 39.9609V0H5.54004L5.53711 0.0078125ZM5.54004 37.6631L7.89062 40.0146H40.1113L40.1133 7.89844L37.7627 5.54785H5.53711L5.54004 37.6631Z"
        fill="black"
      />
      <path
        d="M2.5 0V18.4756L11.6588 9.31679"
        stroke="black"
        strokeWidth="5"
        strokeLinejoin="bevel"
      />
    </svg>
  );
}

export function ZeroFrictionIcon() {
  return (
    <svg
      width="40"
      height="54"
      viewBox="0 0 40 54"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M5.53711 0.0078125L34.0576 0.0107422L39.6504 5.60449L39.6533 53.5625H34.1133L34.1113 53.5537H5.59375L0 47.9609V0H5.54004L5.53711 0.0078125ZM5.54004 45.6631L7.89062 48.0146H34.1113L34.1133 7.89844L31.7627 5.54785H5.53711L5.54004 45.6631Z"
        fill="black"
      />
      <rect x="12" y="12" width="16" height="16" fill="black" />
      <rect x="12" y="32" width="16" height="4" fill="black" />
      <rect x="12" y="38" width="16" height="4" fill="black" />
    </svg>
  );
}

export function ZeroCentralizationIcon() {
  return (
    <svg
      width="53"
      height="50"
      viewBox="0 0 53 50"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M14.624 0L15.3555 0.730469L21.2871 6.64844L22.0215 7.38184V12.2188L16.8506 17.3896L16.8438 17.3828L15.3574 18.8701L14.625 19.6016H7.38281L6.65039 18.8701L0.732422 12.9512L0 12.2188V7.38281L7.38281 0H14.624ZM9.4541 5L5 9.4541V10.1475L9.4541 14.6016H12.5547L13.8848 13.2705L13.8916 13.2773L17.0215 10.1484V9.45508L12.5566 5H9.4541Z"
        fill="black"
      />
      <path
        d="M14.624 0L15.3555 0.730469L21.2871 6.64844L22.0215 7.38184V12.2188L16.8506 17.3896L16.8438 17.3828L15.3574 18.8701L14.625 19.6016H7.38281L6.65039 18.8701L0.732422 12.9512L0 12.2188V7.38281L7.38281 0H14.624ZM9.4541 5L5 9.4541V10.1475L9.4541 14.6016H12.5547L13.8848 13.2705L13.8916 13.2773L17.0215 10.1484V9.45508L12.5566 5H9.4541Z"
        fill="black"
        transform="translate(15, 15)"
      />
      <path
        d="M14.624 0L15.3555 0.730469L21.2871 6.64844L22.0215 7.38184V12.2188L16.8506 17.3896L16.8438 17.3828L15.3574 18.8701L14.625 19.6016H7.38281L6.65039 18.8701L0.732422 12.9512L0 12.2188V7.38281L7.38281 0H14.624ZM9.4541 5L5 9.4541V10.1475L9.4541 14.6016H12.5547L13.8848 13.2705L13.8916 13.2773L17.0215 10.1484V9.45508L12.5566 5H9.4541Z"
        fill="black"
        transform="translate(30, 15)"
      />
      <path
        d="M14.624 0L15.3555 0.730469L21.2871 6.64844L22.0215 7.38184V12.2188L16.8506 17.3896L16.8438 17.3828L15.3574 18.8701L14.625 19.6016H7.38281L6.65039 18.8701L0.732422 12.9512L0 12.2188V7.38281L7.38281 0H14.624ZM9.4541 5L5 9.4541V10.1475L9.4541 14.6016H12.5547L13.8848 13.2705L13.8916 13.2773L17.0215 10.1484V9.45508L12.5566 5H9.4541Z"
        fill="black"
        transform="translate(15, 30)"
      />
    </svg>
  );
}

export function ZeroRestrictionsIcon() {
  return (
    <svg
      width="75"
      height="52"
      viewBox="0 0 75 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M52.3397 10.8743L49.453 12.3713L46.3466 22.1741L45.8876 23.6204L47.0438 25.8499L58.2938 29.4172L61.1796 27.9211L62.5253 30.5168L63.4882 29.5559L63.4989 29.5667L69.1688 23.8967V21.3879L60.8026 13.0413H57.5507V8.04126H62.87L63.6024 8.77173L73.4344 18.5813L74.1688 19.3137V25.969L66.079 34.0588L66.0673 34.0471L63.6044 36.511L62.8719 37.2434H57.5507V34.426L43.5585 29.9905L40.495 24.0842L45.3134 8.88501L50.038 6.43579L52.3397 10.8743Z"
        fill="black"
      />
      <path
        d="M15.9749 12.5539L14.8427 7.65379L18.3754 2.01352L27.1392 -2.78647e-05L28.259 4.87383L21.5129 6.42381L20.1812 8.54998L20.8731 11.5461L16.1123 12.6399L15.9749 12.5539Z"
        fill="black"
      />
      <path
        d="M8.95605 18.7734L12.4912 22.3086L9.84765 24.958L9.84766 31.4609L18.1924 39.8057L20.7041 39.8057L29.0498 31.46L29.0498 25.1055L32.6572 21.498L33.3174 22.1562L34.0498 22.8887L34.0498 33.5312L22.7754 44.8057L16.1221 44.8057L4.84766 33.5312L4.84765 22.8906L8.95605 18.7734Z"
        fill="black"
      />
    </svg>
  );
}