import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import { Button } from "../components/ui/button";

const meta: Meta = { title: "Molecules/Tooltip" };
export default meta;

export const Default: StoryObj = {
    render: () => (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="outline" size="sm">Hover me</Button>
                </TooltipTrigger>
                <TooltipContent>Deploy agent</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    ),
};
