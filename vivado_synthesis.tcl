
# =============================================================================
# Vivado Synthesis Script — DKES_RTL
# Seal: FPGA-SYNTHESIS-DKES-2026-06-02
# Arquiteto: ORCID 0009-0005-2697-4668
# =============================================================================

# 1. Setup project
set project_name "dkes_fpga"
set part "xcvu37p-fsvh2892-2L-e"
set board "xilinx_u280_gen3x16_xdma_base_1"

create_project $project_name ./$project_name -part $part -force
set_property board_part $board [current_project]

# 2. Add sources
add_files {dkes_rtl.v}
add_files {dkes_constraints.xdc}

# 3. Set top module
set_property top DKES_RTL [get_filesets sources_1]

# 4. Synthesis settings
set_property strategy "Vivado Synthesis Defaults" [get_runs synth_1]
set_property STEPS.SYNTH_DESIGN.ARGS.FLATTEN_HIERARCHY "none" [get_runs synth_1]
set_property STEPS.SYNTH_DESIGN.ARGS.KEEP_EQUIVALENT_REGISTERS "true" [get_runs synth_1]

# 5. NTT engine optimization — unroll factor 2
set_property STEPS.SYNTH_DESIGN.ARGS.RETIMING "true" [get_runs synth_1]

# 6. Run synthesis
launch_runs synth_1 -jobs 16
wait_on_run synth_1

# 7. Implementation settings
set_property strategy "Performance_ExplorePostRoutePhysOpt" [get_runs impl_1]
set_property STEPS.PHYS_OPT_DESIGN.ARGS.DIRECTIVE "AggressiveExplore" [get_runs impl_1]
set_property STEPS.ROUTE_DESIGN.ARGS.DIRECTIVE "AggressiveExplore" [get_runs impl_1]

# 8. Run implementation
launch_runs impl_1 -to_step write_bitstream -jobs 16
wait_on_run impl_1

# 9. Generate reports
report_utilization -file ./reports/utilization.rpt
report_timing_summary -file ./reports/timing.rpt
report_power -file ./reports/power.rpt
report_drc -file ./reports/drc.rpt

# 10. Export bitstream
write_bitstream -force ./bitstream/dkes_fpga.bit

puts "========================================"
puts "FPGA Synthesis Complete"
puts "Seal: FPGA-SYNTHESIS-DKES-2026-06-02"
puts "========================================"
