import { AnchorButton, Icon, Tag } from "@blueprintjs/core";
import React from "react";
import css from "./Osdk.module.css";

const DOCUMENTATION_URL =
  "https://silverformedia.usw-23.palantirfoundry.com/workspace/developer-console/app/ri.third-party-applications.main.application.cb5e9627-c183-42e2-80f5-ed6a120a9e96/docs/guide/loading-data?language=typescript";

function Osdk(): React.ReactElement {
  return (
    <div className={css.osdk}>
      <div>
        <span>OSDK: </span>
        <Tag minimal={true}>@invitation-homes-asset-management/sdk</Tag>
      </div>
      <AnchorButton
        href={DOCUMENTATION_URL}
        target="_blank"
        rel="noreferrer"
        variant="minimal"
        icon={<Icon icon="book" aria-label="Book icon"></Icon>}
      >
        View documentation
      </AnchorButton>
    </div>
  );
}

export default Osdk;
